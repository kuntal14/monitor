/* eslint-env worker */

// console.log("displayFrame worker loaded");

// Column,Indices,Component
// Column 0,"[0, 1, 2, 3]",X-Axis Scaling (matrix[0])
// Column 1,"[4, 5, 6, 7]",Y-Axis Scaling (matrix[5])
// Column 3,"[12, 13, 14, 15]",Translation

let shaderCode = null;
let canvas = null;
let gpuState = null;

const TRANSFORM_MATRIX = new Float32Array([
    1.0, 0.0, 0.0, 0.0, // Column 0 (x-axis)
    0.0, 1.0, 0.0, 0.0, // Column 1 (y-axis)
    0.0, 0.0, 1.0, 0.0, // Column 2 (z-axis)
    0.0, 0.0, 0.0, 1.0, // Column 3 (translation/w)
]);

// a derivative of the identity matrix that will be modified to scale the frame to fit the canvas
let matrix = new Float32Array(TRANSFORM_MATRIX);

function createScaleMatrix(frameWidth, frameHeight, scaleEternal) {
    
    // Calculate aspect ratios
    const canvasRatio = canvas.width / canvas.height;
    const frameRatio = frameWidth / frameHeight;
    
    let scaleX = 1.0;
    let scaleY = 1.0;

    if (frameRatio > canvasRatio) {
        // Frame is Wider (Pillarboxing): Scale Y down to fit the frame's height relative to the canvas.
        scaleY = canvasRatio / frameRatio;
        // Your logic was: scaleY = Rc / Rf
    } else if (frameRatio < canvasRatio) {
        // Frame is Taller (Letterboxing): Scale X down to fit the frame's width relative to the canvas.
        scaleX = frameRatio / canvasRatio;
        // Your logic was: scaleX = Rf / Rc
    }
    
    // Update the matrix:
    // Index 0: X-scale component (matrix[0][0])
    matrix[0] = scaleX*scaleEternal;
    // Index 5: Y-scale component (matrix[1][1])
    matrix[5] = scaleY*scaleEternal;

    // return matrix;
}

function transform(x=1, y=1, z=1) {
    matrix[12] = x; // translation x    
    matrix[13] = y; // translation y
    matrix[14] = z; // translation z
}

async function loadShader() {
    try {
        const response = await fetch(new URL('./frame.wgsl', import.meta.url));
        shaderCode = await response.text();
        // console.log("Shader loaded successfully");
    } catch (error) {
        // console.error("Failed to load shader:", error);
    }
}

async function start(receivedCanvas) {
    // console.log("Starting 3D rendering with canvas:", receivedCanvas.width, "x", receivedCanvas.height);
    canvas = receivedCanvas;
    await loadShader();
    await Initialize(canvas);
}

const Initialize = async (canvas) => {
    let adapter = null;
    let device = null;

    // Add adapter info logging
    try {
        adapter = await navigator.gpu.requestAdapter();
    } catch (e) {
        // console.error("Failed to get GPU adapter:", e);
        return;
    }

    try {
        device = await adapter.requestDevice();
    } catch (e) {
        // console.error("Failed to get GPU device:", e);
        return;
    }
    
    const context = canvas.getContext("webgpu");
    
    if (!context) {
        // console.error("🔴 Failed to get WebGPU context from canvas!");
        return;
    }
    
    
    // Use the preferred format instead of hardcoding
    const format = navigator.gpu.getPreferredCanvasFormat();

    context.configure({
        device: device,
        format: format,
    });
    

    const bindGroupLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: {
                    type: 'uniform',
                }
            },
            {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                externalTexture: {},
            },
            {
                binding: 2,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {
                    type: 'filtering',
                }
            }
        ]
    });

    const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout]
    });

    const uniformBuffer = device.createBuffer({
        size: TRANSFORM_MATRIX.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // this will be updated per frame based on the frame and canvas size -- used previously when the identity matrix wasnt changed to send as a bind variable
    // device.queue.writeBuffer(uniformBuffer, 0, TRANSFORM_MATRIX);

    const sampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
    });

    const shaderModule = device.createShaderModule({
        code: shaderCode,
    });

    const pipeline = device.createRenderPipeline({
        layout: pipelineLayout,
        vertex: {
            module: shaderModule,
            entryPoint: 'vs_main',
        },
        fragment: {
            module: shaderModule,
            entryPoint: 'fs_main',
            targets: [{ format: format }]
        },
        primitive: {
            topology: "triangle-list",
        }
    });

    pipeline.label = "Video Frame Render Pipeline";

    gpuState = {
        device,
        context,
        format,
        sampler,
        bindGroupLayout,
        pipeline,
        uniformBuffer,
    };

};

function renderFrame(frame) {
    if (!gpuState || !gpuState.device) {
        console.error("GPU state is not initialized.");
        return;
    }
    
    const { device, context, sampler, bindGroupLayout, pipeline, uniformBuffer } = gpuState;

    device.pushErrorScope('validation');
    device.pushErrorScope('out-of-memory');
    device.pushErrorScope('internal');

    let texture;

    // load the texture from the video frame
    try {
        texture = device.importExternalTexture({
            source: frame,
            colorSpace: 'srgb',
        });
    } catch (error) {
        frame.close();
        return;
    }

    // write the updated transform matrix to the uniform buffer
    const scaleEternal = 0.5;
    createScaleMatrix(frame.codedWidth, frame.codedHeight, scaleEternal);
    transform(0, 0, 0);

    // write the updated matrix to the uniform buffer
    device.queue.writeBuffer(uniformBuffer, 0, matrix);

    const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: texture },
            { binding: 2, resource: sampler },
        ]
    });

    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();

    const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: textureView,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
        }]
    });

    renderPass.setPipeline(pipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.draw(6);
    renderPass.end();
    
    device.queue.submit([commandEncoder.finish()]);

    frame.close();
}

self.addEventListener("message", async (message) => {
    if (message.data.canvas && !canvas) {
        await start(message.data.canvas);
        return;
    }

    // Handle video frames
    if (message.data.frame) {
        renderFrame(message.data.frame);
        return;
    }
    
});
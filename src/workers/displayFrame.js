/* eslint-env worker */

// console.log("displayFrame worker loaded");

let shaderCode = null;
let canvas = null;
let gpuState = null;

const IDENTITY_MATRIX = new Float32Array([
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    0.0, 0.0, 0.0, 1.0,
]);

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
        size: IDENTITY_MATRIX.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(uniformBuffer, 0, IDENTITY_MATRIX);

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
    try {
        texture = device.importExternalTexture({
            source: frame,
            colorSpace: 'srgb',
        });
    } catch (error) {
        frame.close();
        return;
    }

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
            clearValue: { r: 0, g: 1, b: 0, a: 1 },
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
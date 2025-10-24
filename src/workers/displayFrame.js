/* eslint-env worker */

console.log("displayFrame worker loaded");

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
        const uri = new URL('@/workers/frame.wgsl', import.meta.url);
        const response = await fetch(uri);
        shaderCode = await response.text();
        console.log("Shader loaded successfully");
    } catch (error) {
        console.error("Failed to load shader:", error);
    }
}

async function start(canvas) {
    console.log("starting 3d rendering");
    await loadShader();
    await Initialize(canvas);
}

const Initialize = async (canvas) => {
    let adapter = null;
    let device = null;

    try {
        adapter = await navigator.gpu.requestAdapter();
    } catch (e) {
        console.error("Failed to get GPU adapter:", e);
        return;
    }

    try {
        device = await adapter.requestDevice();
    } catch (e) {
        console.error("Failed to get GPU device:", e);
        return;
    }

    const context = canvas.getContext("webgpu");
    const format = "bgra8unorm";

    context.configure({
        device: device,
        format: format,
    });

    // Bind group layout with sampler for texture_external
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
                    type: 'filtering', // Use 'filtering' for texture_external
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

    // Create sampler for external texture
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

    console.log("GPU Initialization complete: ready to receive frames");
};

function renderFrame(frame) {
    if (!gpuState || !gpuState.device) {
        console.error("GPU state is not initialized.");
        return;
    }

    const { device, context, sampler, bindGroupLayout, pipeline, uniformBuffer } = gpuState;

    // Import external texture from VideoFrame
    const texture = device.importExternalTexture({
        source: frame,
        colorSpace: 'srgb',
    });

    // Create bind group with sampler
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
    renderPass.draw(6, 1, 0, 0);
    renderPass.end();
    
    const commandBuffer = commandEncoder.finish();
    device.queue.submit([commandBuffer]);

    frame.close();
    console.log("Frame rendered");
}

self.addEventListener("message", async (message) => {
    console.log("Message received in displayFrame worker");

    if (message.data.canvas && gpuState == null) {
        canvas = message.data.canvas;
        await start(canvas);
    } else if (message.data.frame) {
        renderFrame(message.data.frame);
    } else {
        console.log("Cannot decrypt frame or canvas, or gpuState already initialized");
    }
});
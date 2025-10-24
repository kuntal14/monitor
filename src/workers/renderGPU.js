/* eslint-env worker */

let canvas = null;
let shaderCode = null;

// this function loads the shader code from an external file
async function loadShader() {
    try {
        const shaderCodeUrl = new URL("@/workers/shader.wgsl", import.meta.url); // Adjust the path as necessary
        const response = await fetch(shaderCodeUrl);  // Absolute path from server root
        shaderCode = await response.text();
        console.log("Shader loaded successfully", shaderCode);
    } catch (error) {
        console.error("Failed to load shader:", error);
    }
}

function start(canvas) {
    console.log("starting 3D rendering");
    Initialize(canvas);
}

const Initialize = async (canvas) => {
    if (canvas) {
        console.log(canvas);
    }
    // get a GPU adapter
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        console.error("Failed to get GPU adapter");
        return;
    } else {
        console.log("GPU Adapter acquired");
    }

    // request a device from the adapter
    const device = await adapter.requestDevice();
    if (!device) {
        console.error("Failed to get GPU device");
        return;
    } else {
        console.log("GPU Device acquired");
    }

    // context
    const context = canvas.getContext("webgpu");

    // configure context
    const format = "bgra8unorm";
    context.configure({
        device: device,
        format: format,
    })

    // create pipeline
    const pipeline = device.createRenderPipeline({
        layout: "auto",  // Add this: Automatically infers an empty layout since no bind groups are used
        vertex: {
            module: device.createShaderModule({
                code: shaderCode,
            }),
            entryPoint: "vs_main",
        },

        fragment: {
            module: device.createShaderModule({
                code: shaderCode,
            }),
            entryPoint: "fs_main",
            targets: [{
                format: format,
            }]
        },

        primitive : {
            topology: "triangle-list",
        }
    })

    // this creates a command encoder that can be sent to the GPU
    const commandEncoder = device.createCommandEncoder();
    // this gets the back buffer which has been drawn till now and then makes a view that can be shown on the canvas
    const textureView = context.getCurrentTexture().createView(); 

    // Begin a render pass: defines the rendering operations and attachments
    const renderPass = commandEncoder.beginRenderPass({
        // Array of color attachments: specifies where and how to render color output
        colorAttachments: [{
            // The texture view to render into (the canvas's back buffer)
            view: textureView,
            // Color to clear the attachment with before rendering 
            clearValue: { r: 0, g: 0.0, b: 0, a: 1.0 },
            // Load operation: "clear" means clear the attachment with clearValue before drawing
            loadOp: "clear",
            // Store operation: "store" means save the rendered result to the texture
            storeOp: "store",
        }]
    })

    // Set the render pipeline for this pass (defines shaders and primitive topology)
    renderPass.setPipeline(pipeline);
    // Draw command: draw 6 vertices (forming a triangle), 1 instance, starting from vertex 0 and instance 0
    renderPass.draw(6,1,0,0);
    // End the render pass: finalizes the rendering commands
    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);

    console.log("Rendering completed");


}


self.addEventListener("message", async (message) => {
    canvas = message.data;
    if (canvas) {
        await loadShader();
    } else {
        console.error("3D Render Worker: No offscreen canvas received");
    }
    start(canvas);
})
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

function start(){
    console.log("starting 3D rendering");
}


self.addEventListener("message", async (message) => {
    canvas = message.data;
    if (canvas) {
        await loadShader();
    } else {
        console.error("3D Render Worker: No offscreen canvas received");
    }
    start();
})
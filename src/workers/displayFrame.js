/* eslint-env worker */

function start(frame, canvas) {
    console.log("Displaying frame on canvas");
    const ctx = canvas.getContext("webgpu");
    console.log("Canvas context acquired:", canvas);
    // Here you would add code to copy the frame data to the canvas using WebGPU APIs
    // This is a placeholder for demonstration purposes
    console.log("Frame data:", frame);
    frame.close(); // Release the frame when done
}


self.addEventListener("message", async (message) => {
    // this message will contain the frame reference and buffer and same for the canvas
    // this will take in a frame and display it on the canvas
    const frame = message.data.frame;
    const canvas = message.data.gpuCanvas; // this is the offscreen canvas

    if (!canvas){
        console.error("Display Frame Worker: No offscreen canvas received");
        return;
    }

    start(frame, canvas);
})
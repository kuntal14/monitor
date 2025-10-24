<template>
  <div class="monitor-container">
    <div class="canvas-wrapper">
      <h3>3D Pipeline</h3>
      <canvas class="preview_canvas" ref="previewCanvas"></canvas>
    </div>

    <div class="canvas-wrapper">
      <h3>Video Output</h3>
      <canvas class="image_canvas" ref="imageCanvas"></canvas>
    </div>

    <div class="button">
      <button @click="handleButtonClick">Show Frames</button>
    </div>
  </div>
</template>

<script setup>
import { useAppStore } from '@/stores/appStore';
import { ref } from 'vue';

const state = useAppStore();
let worker = null;
let offscreenCanvas = null;
// 3d worker
let worker3D = null;
let offscreenCanvas3D = null;

// Create refs for both canvases
const previewCanvas = ref(null);
const imageCanvas = ref(null);

// this button is used to call the webworker and initiate the video processing
function handleButtonClick() {
  // Only create worker and OffscreenCanvas once
  if (!worker) {
    const canvas = imageCanvas.value;

    // Set the actual canvas element dimensions to match CSS dimensions
    canvas.width = 480;  // Match the CSS width
    canvas.height = 270; // Match the updated CSS height

    offscreenCanvas = canvas.transferControlToOffscreen();

    if (!worker3D) {
      // the worker does not exist and create one
      const canvas3D = previewCanvas.value;
      // set the actual canvas dimension to match the CSS dinmension
      canvas3D.width = 270;  // Match the CSS width
      canvas3D.height = 360; // Match the updated CSS height

      offscreenCanvas3D = canvas3D.transferControlToOffscreen();
      worker3D = new Worker(new URL('../workers/displayFrame.js', import.meta.url));
      worker3D.addEventListener('error', (e) => console.error('Worker3D error:', e));
      worker3D.addEventListener('message', (e) => console.log('Worker3D message:', e));
      worker3D.postMessage({
        canvas: offscreenCanvas3D
      }, [offscreenCanvas3D]);
    }

    worker = new Worker(new URL('@/workers/decoder.js', import.meta.url));
    worker.addEventListener("message", (message) => {
      // call the second worker which has been initialised as soon as the button is clicked
      // the message received is a frame, use that and the offscreen canvas to render using webgpu
      if (message.data.frame) {
        worker3D.postMessage({
          frame: message.data.frame,
        }, [message.data.frame]);
      }
    });
    // Send OffscreenCanvas only once
    const dataUri = state.stateStatus.videoURL;
    worker.postMessage({ dataUri, offscreenCanvas }, [offscreenCanvas]);
  } else {
    // For subsequent clicks, just send new dataUri
    const dataUri = state.stateStatus.videoURL;
    worker.postMessage({ dataUri });
  }
}

</script>

<style>
.monitor-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
  background-color: #f5f5f5;
  border-radius: 15px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.canvas-wrapper {
  width: 100%;
  margin-bottom: 25px;
  text-align: center;
}

.canvas-wrapper h3 {
  margin-bottom: 10px;
  color: #333;
  font-weight: 500;
  letter-spacing: 0.5px;
}

.preview_canvas,
.image_canvas {
  height: 360px;
  width: 270px;
  background-color: rgb(0, 0, 0);
  border-radius: 12px;
  border: 2px solid #666;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  transition: transform 0.3s ease;
  display: block;
  margin: 0 auto;
}

.image_canvas {
  height: 270px;
  width: 480px;
}

.preview_canvas:hover,
.image_canvas:hover {
  transform: scale(1.02);
}

.button {
  margin-top: 15px;
  margin-bottom: 20px;
  text-align: center;
  width: 100%;
}

button {
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  background-color: #666;
  color: white;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

button:hover {
  background-color: #555;
  transform: translateY(-1px);
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.15);
}

/* For wider screens */
@media (min-width: 768px) {
  .monitor-container {
    padding: 30px;
  }

  .canvas-wrapper {
    display: block;
    width: 100%;
    margin-bottom: 25px;
  }

  .monitor-container {
    flex-direction: column;
    align-items: center;
  }

  .button {
    width: 100%;
  }
}
</style>
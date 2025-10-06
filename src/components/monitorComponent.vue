<template>
  <div>
    <canvas class="monitor_canvas" ref="2d_image">
    </canvas>
    <div class="button">
      <button @click="handleButtonClick">{{ state.version }}</button>
    </div>
  </div>
</template>

<script setup>

import { useAppStore } from '@/stores/appStore';
const state = useAppStore();
let worker = null;
let offscreenCanvas = null;

// this button is used to call the webworker and initiate the video processing
function handleButtonClick() {
  if (worker){
    worker.terminate();
  }
  // get the canvas
  // check if the canvas' control has been transferred to offscreen or not, if so then add a check to not send it again
  if(!offscreenCanvas){
    offscreenCanvas = document.querySelector("canvas").transferControlToOffscreen();
  }

  // initialise the worker again
  worker = new Worker(new URL('@/workers/decoder.js', import.meta.url));
  worker.addEventListener("message", (message) => state.updateStateStatus(message));

  //get the dataURI
  const dataUri = state.stateStatus.videoURL;
  worker.postMessage({dataUri, offscreenCanvas}, [offscreenCanvas])
}



</script>

<style>
.monitor_canvas {
  height: 480px;
  width: 270px;
  background-color: rgb(0, 0, 0);
  border-radius: 10px;
}

.button {
  margin-top: 10px;
  text-align: center;
}

button {
  padding: 10px 20px;
  font-size: 16px;
  border: none;
  border-radius: 5px;
  background-color: #007bff;
  color: white;
  cursor: pointer;
}

button:hover {
  background-color: #0056b3;
}
</style>
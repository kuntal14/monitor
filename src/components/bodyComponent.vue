<template>
  <div class="body">
    <Monitor class="monitor" />
    <Status class="status" />
  </div>
</template>

<script setup>
import Monitor from './monitorComponent.vue';
import Status from './statusComponent.vue';
</script>

<style scoped>
.body {
  display: flex;
  flex-direction: row;
  height: 100%; /* Full viewport height */
  width: 100%; /* Full viewport width */
  margin: 0;
  padding: 0;
}

.monitor {
  height: 100%; /* Full height of the body */
  width: 40%;
  background-color: #939393;
  max-height: 100%; /* Ensure it doesn't overflow the viewport */
  max-width: 100%; /* Ensure it doesn't overflow the viewport */
  margin: 0; /* Center the monitor horizontally */
  border-radius: 10px;
  padding: 0;

  /* Add these styles for centering content */
  display: flex;
  flex-direction: column;
  justify-content: center; /* Center horizontally */
  align-items: center; /* Center vertically */
}

.status {
  flex: 1; /* Occupy the remaining space */
  background-color: #444444; /* Optional: Add a background color for visibility */
  overflow: auto; /* Handle overflow if content exceeds available space */
  border-radius: 10px;

  /* Add these styles for centering content */
  display: flex;
  padding: 3vh;
}
</style>
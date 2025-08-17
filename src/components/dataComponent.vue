<template>
  <div class="data-component">

    <p class="type">{{ props.element[0] }}</p>
    <p class="status">{{ props.element[1] }}</p>

  </div>
</template>

<script setup>

import { defineProps } from "vue";

const props = defineProps({
  element: {
    type: Array,
  }

});

</script>

<style>

.data-component {
  border: 1px solid #ccc;
  padding: 12px;
  border-radius: 4px;
  background-color: #f9f9f9;
  display: flex;
  flex-direction: row;
}

.type {
  font-weight: bold;
  margin-right: 8px;
  background-color: rgb(254, 255, 205);
}

.status {
  color: #555;
}

</style>
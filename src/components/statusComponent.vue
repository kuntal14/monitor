<template>

    <div class="status">
        <data-component v-for="element in stateStatus" :key="element[0]" :element="element"></data-component>
    </div>



</template>

<script setup>

import { useAppStore } from "@/stores/appStore";
import { computed } from "vue";
import dataComponent from "./dataComponent.vue";

const state = useAppStore();

// ----------------------------------------------------------
// the status dictionary
const stateStatus = computed(() => {
    return Object.entries(state.stateStatus);
})




</script>

<style>

.status{
    display: flex;
    flex-wrap: wrap; /* Allow wrapping to the next row */
    justify-content: flex-start; /* Align items to the top */
    flex-direction: column;
    gap: 8px;
}

</style>
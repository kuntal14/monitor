import { defineStore } from "pinia";
import { ref } from "vue";

export const useAppStore = defineStore("app", () => {
    const version = "1.0"
    // const canvas = null; // this is where the canvas data will be stored
    const stateStatus = ref({
        videoStatus: "unloaded",
        videoURL: "/video/avc.mp4"  // Updated path
    })

    const updateStateStatus = (message) => {
        console.log("message : ", message)
    }


    return {
        updateStateStatus,
        version,
        stateStatus,
    }
})
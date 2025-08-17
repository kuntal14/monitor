import { defineStore } from "pinia";
import { ref } from "vue";

export const useAppStore = defineStore("app", () => {
    const version = "1.0"
    // const canvas = null; // this is where the canvas data will be stored
    const stateStatus = ref({
        videoStatus: "unloaded",
        videoURL: "../../public/video/avc.mp4"

    })


    return {
        version,
        stateStatus,
    }
})
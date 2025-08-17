<template>
  <div id="app">
    <!-- this is the header -->
    <div class="header">
      <a href="#default" class="logo">WebCodecs Video</a>
      <div class="header-right">
        <a class="active" href="#home">Home</a>
        <a href="#contact">Contact</a>
        <a href="#about">About</a>
      </div>
    </div>

    <!-- here goes the body component -->
    <Body class="content"></Body>
  </div>
</template>

<script setup>
import Body from './components/bodyComponent.vue';
</script>

<style>
/* Ensure html and body take up the full height of the viewport */
html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  background-color: #000000;
}

/* Ensure the root div also takes up the full height */
#app {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Content styles */
.content {
  flex: 1; /* Make the content take up the remaining space */
  padding: 20px;
  background-color: #000000;
  margin: 0;
  width: 100%;
}

/* Style the header with a grey background and some padding */
.header {
  display: flex; /* Enable flexbox */
  justify-content: space-between; /* Space out the content horizontally */
  align-items: center; /* Center the content vertically */
  overflow: hidden;
  margin: 0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  background-color: #aeaeae;
  border-radius: 5px;
  height: 5vh; /* Use a fixed height for the header */
}

/* Style the header links */
.header a {
  float: left;
  color: black;
  text-align: center;
  padding: 12px;
  text-decoration: none;
  font-size: 18px;
  line-height: 25px;
  border-radius: 4px;
}

/* Style the logo link */
.header a.logo {
  font-size: 25px;
  font-weight: bold;
}

/* Change the background color on mouse-over */
.header a:hover {
  background-color: #ddd;
  color: black;
}

/* Style the active/current link */
.header a.active {
  background-color: rgb(127, 139, 151);
  color: white;
  border-radius: 5px;
}

/* Float the link section to the right */
.header-right {
  float: right;
}

/* Add media queries for responsiveness */
@media screen and (max-width: 500px) {
  .header a {
    float: none;
    display: block;
    text-align: left;
  }

  .header-right {
    float: none;
  }
}
</style>
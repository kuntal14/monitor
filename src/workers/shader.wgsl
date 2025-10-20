// Struct to define the output of the vertex shader, passed to the fragment shader
struct Fragment {
    // Built-in position in clip space (required for vertex shaders)
    @builtin(position) Position : vec4<f32>,
    // User-defined color attribute at location 0 (RGBA)
    @location(0) Color : vec4<f32>
};

// Vertex shader entry point: processes each vertex
@vertex
fn vs_main(@builtin(vertex_index) i_id: u32) -> Fragment{
    // Hardcoded array of 3 vertex positions in normalized device coordinates (-1 to 1)
    var position = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 0.5),   // Top vertex
        vec2<f32>(-0.5, -0.5), // Bottom-left vertex
        vec2<f32>(0.5, -0.5),   // Bottom-right vertex
        vec2<f32>(0.0, 0.0),    // Center vertex
        vec2<f32>(-1, -1),
        vec2<f32>(1, -1),
    );

    // Hardcoded array of 3 vertex colors (RGB)
    var colors = array<vec3<f32>, 6>(
        vec3<f32>(1.0, 0.0, 0.0), // Red
        vec3<f32>(0.0, 1.0, 0.0), // Green
        vec3<f32>(0.0, 0.0, 1.0), // Blue
        vec3<f32>(1.0, 1.0, 1.0), // White
        vec3<f32>(1.0, 1.0, 1.0),
        vec3<f32>(1.0, 1.0, 1.0),
    );

    // Create an instance of the Fragment struct for output
    var output : Fragment;

    // Set the position: convert 2D position to 4D clip space (add Z=0.0, W=1.0)
    output.Position = vec4<f32>(position[i_id], 0.0, 1.0);

    // Set the color: convert 3D RGB to 4D RGBA (add alpha=1.0)
    output.Color = vec4<f32>(colors[i_id], 1.0);

    // Return the output struct to pass to the fragment shader
    return output;
}


@fragment
fn fs_main(@location(0) Color : vec4<f32>) -> @location(0) vec4<f32>{
    return Color;
}
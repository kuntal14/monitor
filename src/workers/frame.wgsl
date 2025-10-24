// Uniform structure for transformation matrix
struct Camera {
    transform: mat4x4<f32>
}

// Bind group 0 - per-frame data
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var frame_texture: texture_external;
@group(0) @binding(2) var frame_sampler: sampler;

// Vertex shader output / Fragment shader input
struct Fragment {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>
}

@vertex
fn vs_main(@builtin(vertex_index) i_id: u32) -> Fragment {
    // Define quad with 6 vertices (two triangles)
    // UV coordinates for texture sampling
    var uvs = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 1.0), // Bottom-Left
        vec2<f32>(1.0, 1.0), // Bottom-Right
        vec2<f32>(1.0, 0.0), // Top-Right
        
        vec2<f32>(0.0, 1.0), // Bottom-Left
        vec2<f32>(1.0, 0.0), // Top-Right
        vec2<f32>(0.0, 0.0)  // Top-Left
    );

    // Normalized device coordinates (clip space)
    var positions = array<vec4<f32>, 6>(
        vec4<f32>(-1.0, -1.0, 0.0, 1.0), // Bottom-Left
        vec4<f32>( 1.0, -1.0, 0.0, 1.0), // Bottom-Right
        vec4<f32>( 1.0,  1.0, 0.0, 1.0), // Top-Right
        
        vec4<f32>(-1.0, -1.0, 0.0, 1.0), // Bottom-Left
        vec4<f32>( 1.0,  1.0, 0.0, 1.0), // Top-Right
        vec4<f32>(-1.0,  1.0, 0.0, 1.0)  // Top-Left
    );

    var output: Fragment;
    output.position = camera.transform * positions[i_id];
    output.uv = uvs[i_id];
    
    return output;
}

@fragment
fn fs_main(input: Fragment) -> @location(0) vec4<f32> {
    // Sample the external texture
    // texture_external requires textureSampleBaseClampToEdge with a sampler
    let color = textureSampleBaseClampToEdge(
        frame_texture,
        frame_sampler,
        input.uv
    );
    
    return color;
}
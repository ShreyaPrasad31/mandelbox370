var canvas;
var gl;
var shaderProgram2D;
var shaderProgram3D;

var renderview2DBuffer;
var renderview3DBuffer;
var texCoordBuffer;

// UI
var view3DWidth  = 600;
var view3DHeight = 600;
var view2DWidth  = 300;
var view2DHeight = 300;
var view2DxPos   = 600;
var view2DyPos   = 300;

// UI Controls
var checkboxJuliabox;
var checkboxSlicer;

// For mouse input
var mouseDown2dView = false;
var mouseDown3dView = false;
var lastMouseX = null;
var lastMouseY = null;

// Mandelbox render/camera parameters
var theta = Math.PI / 4;
var phi = Math.PI / 4;
var distance = 15;
var zoom2D = 10.0;
var anchor2D = vec2.fromValues(0, 0);
var anchor3D = vec3.fromValues(0, 0, 0);
var escapeDistance = 2.0*(3+1)/(3-1);

// Mandelbox parameters
var scaleFactor = 3.0;
var sliceLocation = 0.0;
var maxIterations = 15;
var accuracy = -4;
var viewSlicingPlane = true;
var viewJuliabox = false;
var juliaboxConstant = vec3.fromValues(0, 0, 0);

// JQuery stuff
$(function() {
    $( "#slider-scale" ).slider({
        min: -5,
        max: 6,
        value: 3,
        step: 0.01,
        slide: function( event, ui ) {
            $( "#slider-scale-indicator" ).val( ui.value );
            scaleFactor = ui.value;

            // The escape distances for each scale factor were derived
            // mathematically.
            if (scaleFactor <= 0)
                escapeDistance = 2.0;
            else
                escapeDistance = 2.0 * (scaleFactor + 1) / (scaleFactor - 1);
            $('#slider-slice').slider( "option", "min", -escapeDistance);
            $('#slider-slice').slider( "option", "max", +escapeDistance);

            drawScene();
        }
    });
    $( "#slider-scale-indicator" ).val( 
        $( "#slider-scale" ).slider( "value" ) );

    $( "#slider-slice" ).slider({
        min: -3,
        max: 3,
        value: 0,
        step: 0.01,
        slide: function( event, ui ) {
            $( "#slider-slice-indicator" ).val( ui.value );
            sliceLocation = ui.value;
            juliaboxConstant[2] = sliceLocation;
            drawScene();
        }
    });
    $( "#slider-slice-indicator" ).val( 
        $( "#slider-slice" ).slider( "value" ) );

    $( "#slider-iterations" ).slider({
        min: 1,
        max: 30,
        value: 15,
        step: 1,
        slide: function( event, ui ) {
            $( "#slider-iterations-indicator" ).val( ui.value );
            maxIterations = ui.value;
            drawScene();
        }
    });
    $( "#slider-iterations-indicator" ).val( 
        $( "#slider-iterations" ).slider( "value" ) );

    $( "#slider-accuracy" ).slider({
        min: -8,
        max: -3,
        value: -4,
        step: 0.01,
        slide: function( event, ui ) {
            accuracy = Math.pow(10, ui.value);
            $( "#slider-accuracy-indicator" ).val( accuracy.toPrecision(2) );
            drawScene();
        }
    });
    accuracy = Math.pow(10, $( "#slider-accuracy" ).slider( "value" ) )
    $( "#slider-accuracy-indicator" ).val( accuracy.toPrecision(2) );
});

function initGL(canvas) {
    try {
        gl = canvas.getContext("experimental-webgl");
        gl.viewportWidth = canvas.width;
        gl.viewportHeight = canvas.height;
    } catch (e) {
    }
    if (!gl) {
        alert("Could not initialise WebGL, sorry :-(");
    }
}

function getShader(gl, id) {
    var shaderScript = document.getElementById(id);
    if (!shaderScript) {
        return null;
    }

    var str = "";
    var k = shaderScript.firstChild;
    while (k) {
        if (k.nodeType == 3) {
            str += k.textContent;
        }
        k = k.nextSibling;
    }

    var shader;
    if (shaderScript.type == "x-shader/x-fragment") {
        shader = gl.createShader(gl.FRAGMENT_SHADER);
    } else if (shaderScript.type == "x-shader/x-vertex") {
        shader = gl.createShader(gl.VERTEX_SHADER);
    } else {
        return null;
    }

    gl.shaderSource(shader, str);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert(gl.getShaderInfoLog(shader));
        return null;
    }

    return shader;
}

function createProgram(fragmentShaderID, vertexShaderID) {
    var fragmentShader = getShader(gl, fragmentShaderID);
    var vertexShader = getShader(gl, vertexShaderID);

    program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        alert("Could not initialise shaders");
    }

    program.vertexPositionAttribute = 
        gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(program.vertexPositionAttribute);

    program.texCoordAttribute = 
        gl.getAttribLocation(program, "texCoord");
    gl.enableVertexAttribArray(program.texCoordAttribute);

    program.resolutionUniform = 
        gl.getUniformLocation(program, "resolution");

    program.paramScale = gl.getUniformLocation(program, "scaleFactor");
    program.maxIterations = gl.getUniformLocation(program, "maxIterations");
    program.sliceLocation = gl.getUniformLocation(program, "sliceLocation");
    program.juliaboxConstant = gl.getUniformLocation(program, "juliaboxConstant");
    program.juliaboxMode = gl.getUniformLocation(program, "juliaboxMode");

    return program;
}

function initShaders() {
    shaderProgram2D = createProgram("shader-2dbox", "shader-vs");
    shaderProgram2D.center = gl.getUniformLocation(shaderProgram2D,
        "center");
    shaderProgram2D.zoom2D = gl.getUniformLocation(shaderProgram2D,
        "zoom2D");
    shaderProgram2D.escapeDistance = gl.getUniformLocation(shaderProgram2D,
        "escapeDistance");

    shaderProgram3D = createProgram("shader-3dbox", "shader-vs");
    shaderProgram3D.anchor = gl.getUniformLocation(shaderProgram3D,
        "anchor");
    shaderProgram3D.cameraPos = gl.getUniformLocation(shaderProgram3D,
        "cameraPos");
    shaderProgram3D.cameraLook = gl.getUniformLocation(shaderProgram3D,
        "cameraLook");
    shaderProgram3D.cameraUp = gl.getUniformLocation(shaderProgram3D,
        "cameraUp");
    shaderProgram3D.epsilon = gl.getUniformLocation(shaderProgram3D,
        "epsilon");
    shaderProgram3D.viewSlicingPlane = gl.getUniformLocation(shaderProgram3D,
        "viewSlicingPlane");
}

function initBuffers() {
    renderview2DBuffer = gl.createBuffer();
    vertices = [view2DxPos, 0, 
                view2DxPos, view2DHeight, 
                view2DxPos + view2DWidth, 0,
                view2DxPos, view2DHeight, 
                view2DxPos + view2DWidth, view2DHeight, 
                view2DxPos + view2DWidth, 0]
    gl.bindBuffer(gl.ARRAY_BUFFER, renderview2DBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    renderview2DBuffer.itemSize = 2;
    renderview2DBuffer.numItems = 6;

    renderview3DBuffer = gl.createBuffer();
    vertices = [0, 0, 
                0, view3DHeight, 
                view3DWidth, 0,
                0, view3DHeight, 
                view3DWidth, view3DHeight, 
                view3DWidth, 0]
    gl.bindBuffer(gl.ARRAY_BUFFER, renderview3DBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    renderview3DBuffer.itemSize = 2;
    renderview3DBuffer.numItems = 6;

    texCoordBuffer = gl.createBuffer();
    vertices = [ 0.0, 0.0, 0.0, 1.0, 1.0, 0.0,
                 0.0, 1.0, 1.0, 1.0, 1.0, 0.0]
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
}

function drawScene2D() {
    gl.useProgram(shaderProgram2D);

    // Pass in parameters.
    gl.uniform3f(shaderProgram2D.juliaboxConstant, 
        juliaboxConstant[0], juliaboxConstant[1], juliaboxConstant[2]);
    gl.uniform2f(shaderProgram2D.resolutionUniform, 
        gl.viewportWidth, gl.viewportHeight);
    gl.uniform2f(shaderProgram2D.center, anchor2D[0], anchor2D[1]);
    gl.uniform1f(shaderProgram2D.paramScale, scaleFactor);
    gl.uniform1f(shaderProgram2D.zoom2D, zoom2D);
    gl.uniform1f(shaderProgram2D.sliceLocation, sliceLocation);
    gl.uniform1f(shaderProgram2D.escapeDistance, escapeDistance);
    gl.uniform1i(shaderProgram2D.maxIterations, maxIterations);
    gl.uniform1i(shaderProgram2D.juliaboxMode, viewJuliabox);

    // Assign geometry.
    gl.bindBuffer(gl.ARRAY_BUFFER, renderview2DBuffer);
    gl.vertexAttribPointer(shaderProgram2D.vertexPositionAttribute, 
        2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.vertexAttribPointer(shaderProgram2D.texCoordAttribute, 
        2, gl.FLOAT, false, 0, 0);

    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, renderview2DBuffer.numItems);
}

function drawScene3D() {
    gl.useProgram(shaderProgram3D);

    gl.uniform2f(shaderProgram3D.resolutionUniform, 
        gl.viewportWidth, gl.viewportHeight);

    // Convert Spherical to Cartesian coordinates.
    var x = distance * Math.sin(phi) * Math.cos(theta);
    var z = distance * Math.sin(phi) * Math.sin(theta);
    var y = distance * Math.cos(phi);
    
    gl.uniform3f(shaderProgram3D.cameraPos, 
        x + anchor3D[0], y + anchor3D[1], z + anchor3D[2]);
    gl.uniform3f(shaderProgram3D.cameraLook, -x, -y, -z);
    gl.uniform3f(shaderProgram3D.cameraUp, 0, 1.0, 0);
    gl.uniform3f(shaderProgram3D.anchor, 
        anchor3D[0], anchor3D[1], anchor3D[2]);
    gl.uniform3f(shaderProgram3D.juliaboxConstant, 
        juliaboxConstant[0], juliaboxConstant[1], juliaboxConstant[2]);
    gl.uniform1f(shaderProgram3D.paramScale, scaleFactor);
    gl.uniform1f(shaderProgram3D.sliceLocation, sliceLocation);
    gl.uniform1f(shaderProgram3D.epsilon, accuracy);
    gl.uniform1i(shaderProgram3D.maxIterations, maxIterations);
    gl.uniform1i(shaderProgram3D.viewSlicingPlane, viewSlicingPlane);
    gl.uniform1i(shaderProgram3D.juliaboxMode, viewJuliabox);

    gl.bindBuffer(gl.ARRAY_BUFFER, renderview3DBuffer);
    gl.vertexAttribPointer(shaderProgram3D.vertexPositionAttribute, 
        2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.vertexAttribPointer(shaderProgram3D.texCoordAttribute, 
        2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, renderview3DBuffer.numItems);

}

var lastFrameTime = new Date().getTime();
var time = 0;
function drawScene() {
    gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
    //gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Smooth out the timing measures.
    time = time * 0.9 + (new Date().getTime() - lastFrameTime) * 0.1;
    // $( "#debuglabel" ).val( time );

    drawScene2D();
    drawScene3D();

    lastFrameTime = new Date().getTime();
}

function isIn3DviewArea(x, y) {
    return x < view3DWidth;
}

function isIn2DviewArea(x, y) {
    return x > view2DxPos && y > gl.viewportHeight - view2DHeight;
}

function distanceEstimate(rayPos, constant1, constant2) {
    var c = viewJuliabox ? juliaboxConstant : vec3.clone(rayPos);
    var v = vec3.clone(rayPos);
    var dr = 1.0;

    for (var i = 0; i < maxIterations; i++) {
        var old = vec3.clone(v);
        vec3.max(v, v, vec3.fromValues(-1.0, -1.0, -1.0));
        vec3.min(v, v, vec3.fromValues(+1.0, +1.0, +1.0));
        vec3.scale(v, v, 2.0);
        vec3.sub(v, v, old);

        var mag = vec3.squaredLength(v);
        if (mag < 0.25) {
            vec3.scale(v, v, 4.0);
            dr = dr * 4.0;
        } else if (mag < 1.0) {
            vec3.scale(v, v, 1 / mag);
            dr = dr / mag;
        }

        vec3.scaleAndAdd(v, c, v, scaleFactor);
        dr = dr * Math.abs(scaleFactor) + 1.0;
    }

    return (vec3.length(v) - constant1) / dr - constant2;
}

function getRayLength(cameraPos, direction) {
    // Return the length of the ray from the camera position to 
    // the fractal in a given direction.

    var constant1 = Math.abs(scaleFactor - 1.0);
    var constant2 = Math.pow(Math.abs(scaleFactor), 1.0 - maxIterations);
    var distance = 0;

    for (var i = 0; i < 128; i++) {
        var rayPos = vec3.create();
        vec3.scaleAndAdd(rayPos, cameraPos, direction, distance);
        var de = distanceEstimate(rayPos, constant1, constant2);

        distance += de * 0.95;

        if (de < accuracy || distance > 50.0)
            return distance;
    }

    return distance;
}

function setJuliaboxCoord(x, y) {
    juliaboxConstant = vec3.fromValues(
        ((x - view2DxPos) / view2DWidth - 0.5) * zoom2D + anchor2D[0],
        (0.5 - (y - view2DyPos) / view2DHeight) * zoom2D + anchor2D[1],
        sliceLocation);
}

function getMousePos(evt) {
    // Need the mouse position relative to the canvas.
    var rect = canvas.getBoundingClientRect();
    return {
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top
    };
}

function handleMouseDown(event) {
    var mousePos = getMousePos(event);

    if (isIn2DviewArea(mousePos.x, mousePos.y)) {
        mouseDown2dView = true;
        setJuliaboxCoord(mousePos.x, mousePos.y);
    }
    else if (isIn3DviewArea(mousePos.x, mousePos.y)) {
        mouseDown3dView = true;
    }

    lastMouseX = mousePos.x;
    lastMouseY = mousePos.y;
}

function handleMouseUp(event) {
    mouseDown2dView = false;
    mouseDown3dView = false;
}

function handleMouseMove(event) {
    var mousePos = getMousePos(event);
    var newX = mousePos.x;
    var newY = mousePos.y;

    if (mouseDown2dView) {
        if (viewJuliabox) {
            setJuliaboxCoord(mousePos.x, mousePos.y);
        } else {
            var diff = vec2.fromValues(lastMouseX - newX, newY - lastMouseY);
            diff = vec2.scale(diff, diff, zoom2D / view2DWidth);
            anchor2D = vec2.add(anchor2D, anchor2D, diff);
        }
    } else if (mouseDown3dView) {

        theta += -(newX - lastMouseX) / gl.viewportWidth * 4;
        phi += -(newY - lastMouseY) / gl.viewportHeight * 4;
        
        // Restriction of phi.
        phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));

    }

    lastMouseX = newX
    lastMouseY = newY;

    drawScene();
}

function handleMouseWheel(event) {
    rolled = 0;
    var rolled = 0;
    if ('wheelDelta' in event)
        rolled = event.wheelDelta;
    else 
        // Firefox, measurement units of the detail and wheelDelta 
        //properties are different.
        rolled = -40 * event.detail;

    var mousePos = getMousePos(event);
    if (isIn2DviewArea(mousePos.x, mousePos.y)) {
        zoom2D *= Math.pow(0.9, rolled / 120);
    }
    else if (isIn3DviewArea(mousePos.x, mousePos.y)) {
        distance *= Math.pow(0.9, rolled / 120);
    }
    

    drawScene();
}

function handleDoubleClick3D(event) {
    var x = distance * Math.sin(phi) * Math.cos(theta);
    var z = distance * Math.sin(phi) * Math.sin(theta);
    var y = distance * Math.cos(phi);

    var pos = vec3.create();
    vec3.add(pos, vec3.fromValues(x, y, z), anchor3D);

    var look = vec3.fromValues(-x, -y, -z);
    var side = vec3.create();
    var up = vec3.fromValues(0.0, 1.0, 0.0);
    vec3.normalize(look, look);
    vec3.normalize(side, vec3.cross(side, up, look));
    vec3.cross(up, look, side);

    var mousePos = getMousePos(event);

    // Sample the distances to the fractal in a small 3x3 window
    // around the position of the mouse click.
    var distances = new Array();
    for (var dx = -1; dx <= 1; dx++) {
        for (var dy = -1; dy <= 1; dy++) {
            var rayDir = vec3.clone(look);
            vec3.scaleAndAdd(rayDir, rayDir, side, 
                (mousePos.x + dx) / view3DWidth - 0.5);
            vec3.scaleAndAdd(rayDir, rayDir, up, 
                0.5 - (mousePos.y + dy) / view3DHeight);

            distances.push(getRayLength(pos, rayDir));
        }
    }
    distances.sort(function(a,b){return a-b});

    // Take 3rd closest one to be the distance to the new anchor.
    // We do it this way to average out variation caused by the fractal's
    // complex shape. We don't actually take the average though, incase
    // some rays don't hit the fractal.
    if (distances[2] < 50.0) {
        var rayDir = vec3.clone(look);
        vec3.scaleAndAdd(rayDir, rayDir, side, 
            mousePos.x / view3DWidth - 0.5);
        vec3.scaleAndAdd(rayDir, rayDir, up, 
            0.5 - mousePos.y / view3DHeight); 
        vec3.scaleAndAdd(anchor3D, pos, rayDir, distances[2]);
        distance = distances[2];
    }

    drawScene();
}

function handleDoubleClick(event) {
    var mousePos = getMousePos(event);
    if (isIn2DviewArea(mousePos.x, mousePos.y))
        mouseDown2dView = true;
    else if (isIn3DviewArea(mousePos.x, mousePos.y))
        handleDoubleClick3D(event);

    // Sometimes double click leaves the mouse in a "down" state.
    mouseDown2dView = false;
    mouseDown3dView = false;
}

function handleCheckboxClickJuliaBox(event) {
    viewJuliabox = checkboxJuliabox.checked;
    drawScene();
}

function handleCheckboxClickSlicer(event) {
    viewSlicingPlane = checkboxSlicer.checked;
    drawScene();
}

function webGLStart() {
    canvas = document.getElementById("mandelbox-canvas");
    initGL(canvas);
    initShaders();
    initBuffers();

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.DEPTH_TEST);

    canvas.onmousedown = handleMouseDown;
    document.onmouseup = handleMouseUp;
    document.onmousemove = handleMouseMove;
    document.ondblclick = handleDoubleClick;

     if (canvas.addEventListener) {    
        // all browsers except IE before version 9
        // Internet Explorer, Opera, Google Chrome and Safari
        canvas.addEventListener ("mousewheel", handleMouseWheel, false);
        // Firefox
        canvas.addEventListener ("DOMMouseScroll", handleMouseWheel, false);
    }
    else {
        if (canvas.attachEvent) { // IE before version 9
            canvas.attachEvent ("onmousewheel", handleMouseWheel);
        }
    }

    drawScene();

    checkboxJuliabox = document.getElementById("toggle-juliabox");
    checkboxSlicer = document.getElementById("toggle-slicer");
    checkboxJuliabox.onclick = handleCheckboxClickJuliaBox;
    checkboxSlicer.onclick = handleCheckboxClickSlicer;

    // Avoid double click selecting text.
    $("body").disableSelection();
}
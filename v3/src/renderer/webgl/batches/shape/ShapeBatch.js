var BindVertexArray = require('../../utils/vao/BindVertexArray');
var CreateProgram = require('../../utils/shader/CreateProgram');
var CreateShader = require('../../utils/shader/CreateShader');
var CreateBuffer = require('../../utils/buffer/CreateBuffer');
var CreateAttribDesc = require('../../utils/vao/CreateAttribDesc');
var Buffer32 = require('../../utils/buffer/Buffer32');
var VertexArray = require('../../utils/vao/VertexArray');
var Earcut = require('./earcut');

var PHASER_CONST = require('../../../../const');
var CONST = require('./const');

var ShapeBatch = function (game, gl, manager)
{
    this.game = game;
    this.type = PHASER_CONST.WEBGL;
    this.view = game.canvas;
    this.resolution = game.config.resolution;
    this.width = game.config.width * game.config.resolution;
    this.height = game.config.height * game.config.resolution;
    this.glContext = gl;
    this.maxVertices = null;
    this.vertShader = null;
    this.fragShader = null;
    this.program = null;
    this.vertexArray = null;
    this.vertexDataBuffer = null;
    this.vertexCount = 0;
    this.viewMatrixLocation = null;

    //   All of these settings will be able to be controlled via the Game Config
    this.config = {
        clearBeforeRender: true,
        transparent: false,
        autoResize: false,
        preserveDrawingBuffer: false,

        WebGLContextOptions: {
            alpha: true,
            antialias: true,
            premultipliedAlpha: true,
            stencil: true,
            preserveDrawingBuffer: false
        }
    };

    this.manager = manager;
    this.dirty = false;
    this.context = null;
    this.init(this.glContext);

};

ShapeBatch.prototype.constructor = ShapeBatch;

ShapeBatch.prototype = {

    init: function (gl)
    {
        var vertexDataBuffer = new Buffer32(CONST.VERTEX_SIZE * CONST.MAX_VERTICES);
        var vertShader = CreateShader(gl, CONST.VERTEX_SHADER_SOURCE, gl.VERTEX_SHADER);
        var fragShader = CreateShader(gl, CONST.FRAGMENT_SHADER_SOURCE, gl.FRAGMENT_SHADER);
        var program = CreateProgram(gl, vertShader, fragShader);
        var attribArray = [
            CreateAttribDesc(gl, program, 'a_position', 2, gl.FLOAT, false, CONST.VERTEX_SIZE, 0),
            CreateAttribDesc(gl, program, 'a_color', 4, gl.UNSIGNED_BYTE, true, CONST.VERTEX_SIZE, 8),
            CreateAttribDesc(gl, program, 'a_alpha', 1, gl.FLOAT, false, CONST.VERTEX_SIZE, 12)
        ];
        var vertexArray = new VertexArray(CreateBuffer(gl, gl.ARRAY_BUFFER, gl.STREAM_DRAW, null, vertexDataBuffer.getByteCapacity()), attribArray);
        var viewMatrixLocation = gl.getUniformLocation(program, 'u_view_matrix');
        var max = CONST.MAX_VERTICES;

        this.vertexDataBuffer = vertexDataBuffer;
        this.vertShader = vertShader;
        this.fragShader = fragShader;
        this.program = program;
        this.vertexArray = vertexArray;
        this.viewMatrixLocation = viewMatrixLocation;
        this.maxVertices = max;
        this.polygonCache = [];

        this.bind();
        this.resize(this.width, this.height, this.game.config.resolution);
        this.unbind();
    },

    isFull: function ()
    {
        return (this.vertexDataBuffer.getByteLength() >= this.vertexDataBuffer.getByteCapacity());
    },

    bind: function ()
    {
        var gl = this.glContext;

        gl.useProgram(this.program);
        gl.clearColor(0, 0, 0, 1);
        BindVertexArray(gl, this.vertexArray);
    },

    unbind: function ()
    {
        var gl = this.glContext;

        gl.useProgram(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
    },

    flush: function ()
    {
        var gl = this.glContext;
        var vertexDataBuffer = this.vertexDataBuffer;

        if (this.vertexCount > 0)
        {
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertexDataBuffer.getUsedBufferAsFloat());
            gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
            vertexDataBuffer.clear();
            this.vertexCount = 0;
        }
    },

    resize: function (width, height, resolution)
    {
        var gl = this.glContext;
        
        this.width = width * resolution;
        this.height = height * resolution;
        
        gl.uniformMatrix4fv(
            this.viewMatrixLocation,
            false,
            new Float32Array([
                2 / this.width, 0, 0, 0,
                0, -2 / this.height, 0, 0,
                0, 0, 1, 1,
                -1, 1, 0, 0
            ])
        );
    },

    destroy: function ()
    {
        var gl = this.glContext;

        if (gl)
        {
            gl.deleteShader(this.vertShader);
            gl.deleteShader(this.fragShader);
            gl.deleteProgram(this.program);
            gl.deleteBuffer(this.vertexArray.buffer);
        }
    },

    addFillPath: function (
        /* Graphics Game Object properties */
        srcX, srcY, srcScaleX, srcScaleY, srcRotation,
        /* Path properties */
        path, fillColor, fillAlpha,
        /* transform */
        a, b, c, d, e, f
    ) {
        var length = path.length;
        var polygonCache = this.polygonCache;
        var polygonIndexArray;
        var point;
        var v0, v1, v2;
        var vertexOffset;
        var vertexCount = this.vertexCount;
        var maxVertices = this.maxVertices;
        var vertexDataBuffer = this.vertexDataBuffer;
        var vertexBufferF32 = vertexDataBuffer.floatView;
        var vertexBufferU32 = vertexDataBuffer.uintView;
        var x0, y0, x1, y1, x2, y2;
        var tx0, ty0, tx1, ty1, tx2, ty2;

        for (var pathIndex = 0; pathIndex < length; ++pathIndex)
        {
            point = path[pathIndex];
            polygonCache.push(point.x, point.y);
        }
        polygonIndexArray = Earcut(polygonCache);
        length = polygonIndexArray.length;

        for (var index = 0; index < length; index += 3)
        {
            v0 = polygonIndexArray[index + 0] * 2;
            v1 = polygonIndexArray[index + 1] * 2;
            v2 = polygonIndexArray[index + 2] * 2;

            if (vertexCount + 3 > maxVertices)
            {
                this.vertexCount = vertexCount;
                this.flush();
                vertexCount = 0;
            }
            vertexOffset = vertexDataBuffer.allocate(12);
            vertexCount += 3;

            x0 = polygonCache[v0 + 0];
            y0 = polygonCache[v0 + 1];
            x1 = polygonCache[v1 + 0];
            y1 = polygonCache[v1 + 1];
            x2 = polygonCache[v2 + 0];
            y2 = polygonCache[v2 + 1];

            tx0 = x0 * a + y0 * c + e;
            ty0 = x0 * b + y0 * d + f;
            tx1 = x1 * a + y1 * c + e;
            ty1 = x1 * b + y1 * d + f;
            tx2 = x2 * a + y2 * c + e;
            ty2 = x2 * b + y2 * d + f;

            vertexBufferF32[vertexOffset++] = tx0;
            vertexBufferF32[vertexOffset++] = ty0;
            vertexBufferU32[vertexOffset++] = fillColor;
            vertexBufferF32[vertexOffset++] = fillAlpha;

            vertexBufferF32[vertexOffset++] = tx1;
            vertexBufferF32[vertexOffset++] = ty1;
            vertexBufferU32[vertexOffset++] = fillColor;
            vertexBufferF32[vertexOffset++] = fillAlpha;

            vertexBufferF32[vertexOffset++] = tx2;
            vertexBufferF32[vertexOffset++] = ty2;
            vertexBufferU32[vertexOffset++] = fillColor;
            vertexBufferF32[vertexOffset++] = fillAlpha;

        }
        this.vertexCount = vertexCount;
        polygonCache.length = 0;
    },

    addFillRect: function (
        /* Graphics Game Object properties */
        srcX, srcY, srcScaleX, srcScaleY, srcRotation,
        /* Rectangle properties */
        x, y, width, height, fillColor, fillAlpha,
        /* transform */
        a, b, c, d, e, f
    ) {
        if (this.vertexCount + 6 > this.maxVertices)
        {
            this.flush();
        }
        var vertexDataBuffer = this.vertexDataBuffer;
        var vertexBufferF32 = vertexDataBuffer.floatView;
        var vertexBufferU32 = vertexDataBuffer.uintView;
        var vertexOffset = vertexDataBuffer.allocate(24);
        var xw = x + width;
        var yh = y + height;
        var tx0 = x * a + y * c + e;
        var ty0 = x * b + y * d + f;
        var tx1 = x * a + yh * c + e;
        var ty1 = x * b + yh * d + f;
        var tx2 = xw * a + yh * c + e;
        var ty2 = xw * b + yh * d + f;
        var tx3 = xw * a + y * c + e;
        var ty3 = xw * b + y * d + f;

        vertexBufferF32[vertexOffset++] = tx0;
        vertexBufferF32[vertexOffset++] = ty0;
        vertexBufferU32[vertexOffset++] = fillColor;
        vertexBufferF32[vertexOffset++] = fillAlpha;

        vertexBufferF32[vertexOffset++] = tx1;
        vertexBufferF32[vertexOffset++] = ty1;
        vertexBufferU32[vertexOffset++] = fillColor;
        vertexBufferF32[vertexOffset++] = fillAlpha;

        vertexBufferF32[vertexOffset++] = tx2;
        vertexBufferF32[vertexOffset++] = ty2;
        vertexBufferU32[vertexOffset++] = fillColor;
        vertexBufferF32[vertexOffset++] = fillAlpha;

        vertexBufferF32[vertexOffset++] = tx0;
        vertexBufferF32[vertexOffset++] = ty0;
        vertexBufferU32[vertexOffset++] = fillColor;
        vertexBufferF32[vertexOffset++] = fillAlpha;

        vertexBufferF32[vertexOffset++] = tx2;
        vertexBufferF32[vertexOffset++] = ty2;
        vertexBufferU32[vertexOffset++] = fillColor;
        vertexBufferF32[vertexOffset++] = fillAlpha;

        vertexBufferF32[vertexOffset++] = tx3;
        vertexBufferF32[vertexOffset++] = ty3;
        vertexBufferU32[vertexOffset++] = fillColor;
        vertexBufferF32[vertexOffset++] = fillAlpha;

        this.vertexCount += 6;
    }
};

module.exports = ShapeBatch;

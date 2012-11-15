/*global define*/
define([
        '../Core/BoundingSphere',
        '../Core/BoxTessellator',
        '../Core/Cartesian3',
        '../Core/destroyObject',
        '../Core/DeveloperError',
        '../Core/Ellipsoid',
        '../Core/JulianDate',
        '../Core/Matrix4',
        '../Core/MeshFilters',
        '../Core/PrimitiveType',
        '../Core/TimeStandard',
        '../Core/Transforms',
        '../Renderer/BufferUsage',
        '../Renderer/CommandLists',
        '../Renderer/CullFace',
        '../Renderer/DrawCommand',
        '../Renderer/PixelDatatype',
        '../Renderer/PixelFormat',
        '../Scene/SceneMode'
    ], function(
        BoundingSphere,
        BoxTessellator,
        Cartesian3,
        destroyObject,
        DeveloperError,
        Ellipsoid,
        JulianDate,
        Matrix4,
        MeshFilters,
        PrimitiveType,
        TimeStandard,
        Transforms,
        BufferUsage,
        CommandLists,
        CullFace,
        DrawCommand,
        PixelDatatype,
        PixelFormat,
        SceneMode) {
    "use strict";

    /**
     * DOC_TBA
     *
     * @alias SkyBox
     * @constructor
     */
    var SkyBox = function(source) {
        this._colorCommand = new DrawCommand();
        this._colorCommand.primitiveType = PrimitiveType.TRIANGLES;
        this._colorCommand.boundingVolume = new BoundingSphere();

        this._commandLists = new CommandLists();

        this._cubeMap = undefined;

        if(Array.isArray(source) && source.length === 6) {
            this._source = source;
        }
        else {
            throw new DeveloperError('source must have 6 images.');
        }

        var that = this;
        this._colorCommand.uniformMap = {
            u_cubeMap: function() {
                return that._cubeMap;
            }
        };
    };

    /**
     * @private
     */
    SkyBox.prototype.update = function(context, frameState, commandList) {
        // TODO: Only supports 3D, add Columbus view support.
        if (frameState.mode !== SceneMode.SCENE3D) {
            return;
        }

        var colorCommand = this._colorCommand;

        if (typeof colorCommand.vertexArray === 'undefined') {
            var that = this;

            // Setup Cubemap
            var facesLoaded = 0;
            var images = new Array(6);
            var setupTextures = function(index) {
                var img = new Image();
                img.onload =
                    function() {
                        images[index] = img;
                        if( ++facesLoaded === 6 ) {
                            that._cubeMap = that._cubeMap && that._cubeMap.destroy();
                            that._cubeMap = context.createCubeMap({
                                source: {
                                    positiveX: images[0],
                                    negativeX: images[1],
                                    positiveY: images[2],
                                    negativeY: images[3],
                                    positiveZ: images[4],
                                    negativeZ: images[5]
                                },
                                width: images[0].width,
                                height: images[0].height,
                                pixelFormat: PixelFormat.RGBA,
                                pixelDatatype: PixelDatatype.UNSIGNED_BYTE
                             });
                        }
                    };
                img.onerror = function() {
                    that._exception = 'Could not load image: ' + that._source[index] + '.';
                };
                img.src = that._source[index];
            };

            for(var i=0;i<6;++i) {
                setupTextures(i);
            }

            var vsColor = '';
            vsColor += 'attribute vec4 position;';
            vsColor += 'varying vec3 texCoord;';
            vsColor += 'void main()';
            vsColor += '{';
            vsColor += '    vec3 p = czm_viewRotation * (czm_model * position).xyz;';
            vsColor += '    gl_Position = czm_projection * vec4(p, 1.0);';
            vsColor += '    texCoord = position.xyz;';
            vsColor += '}';
            var fsColor = '';
            fsColor += 'uniform samplerCube u_cubeMap;';
            fsColor += 'varying vec3 texCoord;';
            fsColor += 'void main()';
            fsColor += '{';
            fsColor += '    gl_FragColor = textureCube(u_cubeMap, normalize(texCoord));';
            fsColor += '}';

            // TODO: Determine size of box based on the size of the scene.
            var dimensions = new Cartesian3(100000000.0, 100000000.0, 100000000.0);
            var maximumCorner = dimensions.multiplyByScalar(0.5);
            var minimumCorner = maximumCorner.negate();
            BoundingSphere.fromPoints([minimumCorner, maximumCorner], colorCommand.boundingVolume);

            var mesh = BoxTessellator.compute({
                            minimumCorner: minimumCorner,
                            maximumCorner: maximumCorner
                        });
            var attributeIndices = MeshFilters.createAttributeIndices(mesh);

            colorCommand.vertexArray = context.createVertexArrayFromMesh({
                mesh: mesh,
                attributeIndices: attributeIndices,
                bufferUsage: BufferUsage.STATIC_DRAW
            });

            colorCommand.shaderProgram = context.getShaderCache().getShaderProgram(vsColor, fsColor, attributeIndices);
            colorCommand.renderState = context.createRenderState({
                depthTest : {
                    enabled : true
                },
                depthMask : false,
                cull : {
                    enabled : true,
                    face : CullFace.FRONT
                }
            });
        }

        if (typeof this._cubeMap !== 'undefined') {
            // TODO: Use scene time
            var time = JulianDate.fromDate(new Date(), TimeStandard.UTC);
            this._colorCommand.modelMatrix = Matrix4.fromRotationTranslation(Transforms.computeTemeToPseudoFixedMatrix(time), Cartesian3.ZERO);

            var pass = frameState.passes;
            this._commandLists.removeAll();
            if (pass.color) {
                this._commandLists.colorList.push(colorCommand);
            }

            commandList.push(this._commandLists);
        }
    };

    /**
     * Returns true if this object was destroyed; otherwise, false.
     * <br /><br />
     * If this object was destroyed, it should not be used; calling any function other than
     * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.
     *
     * @memberof SkyBox
     *
     * @return {Boolean} <code>true</code> if this object was destroyed; otherwise, <code>false</code>.
     *
     * @see SkyBox#destroy
     */
    SkyBox.prototype.isDestroyed = function() {
        return false;
    };

    /**
     * Destroys the WebGL resources held by this object.  Destroying an object allows for deterministic
     * release of WebGL resources, instead of relying on the garbage collector to destroy this object.
     * <br /><br />
     * Once an object is destroyed, it should not be used; calling any function other than
     * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.  Therefore,
     * assign the return value (<code>undefined</code>) to the object as done in the example.
     *
     * @memberof SkyBox
     *
     * @return {undefined}
     *
     * @exception {DeveloperError} This object was destroyed, i.e., destroy() was called.
     *
     * @see SkyBox#isDestroyed
     *
     * @example
     * skyBox = skyBox && skyBox.destroy();
     */
    SkyBox.prototype.destroy = function() {
        var colorCommand = this._colorCommand;
        colorCommand.vertexArray = colorCommand.vertexArray && colorCommand.vertexArray.destroy();
        colorCommand.shaderProgram = colorCommand.shaderProgram && colorCommand.shaderProgram.release();
        return destroyObject(this);
    };

    return SkyBox;
});
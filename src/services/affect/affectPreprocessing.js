import * as ort from "onnxruntime-web";

const INPUT_SIZE = 224;

const CHANNEL_MEAN = [0.485, 0.456, 0.406];
const CHANNEL_STD = [0.229, 0.224, 0.225];

export const canvasToAffectTensor = (sourceCanvas) => {
  if (!(sourceCanvas instanceof HTMLCanvasElement)) {
    throw new TypeError(
      "canvasToAffectTensor expected an HTMLCanvasElement."
    );
  }

  const resizeCanvas = document.createElement("canvas");
  resizeCanvas.width = INPUT_SIZE;
  resizeCanvas.height = INPUT_SIZE;

  const context = resizeCanvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!context) {
    throw new Error(
      "Could not create affect preprocessing canvas context."
    );
  }

  context.drawImage(
    sourceCanvas,
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height,
    0,
    0,
    INPUT_SIZE,
    INPUT_SIZE
  );

  const imageData = context.getImageData(
    0,
    0,
    INPUT_SIZE,
    INPUT_SIZE
  );

  const pixelCount = INPUT_SIZE * INPUT_SIZE;
  const tensorData = new Float32Array(3 * pixelCount);

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex++) {
    const rgbaIndex = pixelIndex * 4;

    const red = imageData.data[rgbaIndex] / 255;
    const green = imageData.data[rgbaIndex + 1] / 255;
    const blue = imageData.data[rgbaIndex + 2] / 255;

    // NCHW layout:
    // [all red pixels][all green pixels][all blue pixels]
    tensorData[pixelIndex] =
      (red - CHANNEL_MEAN[0]) / CHANNEL_STD[0];

    tensorData[pixelCount + pixelIndex] =
      (green - CHANNEL_MEAN[1]) / CHANNEL_STD[1];

    tensorData[2 * pixelCount + pixelIndex] =
      (blue - CHANNEL_MEAN[2]) / CHANNEL_STD[2];
  }

  return new ort.Tensor(
    "float32",
    tensorData,
    [1, 3, INPUT_SIZE, INPUT_SIZE]
  );
};
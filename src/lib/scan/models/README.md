# Card scanner OCR models

PaddleOCR models (Apache License 2.0, https://github.com/PaddlePaddle/PaddleOCR) converted to ONNX:

- `det.onnx`: PP-OCRv4 mobile text detection (`ch_PP-OCRv4_det_infer.onnx`, from the `@gutenye/ocr-models` npm package, 1.2.2).
- `rec.onnx` + `dict.txt`: PP-OCRv5 mobile English text recognition (`en_PP-OCRv5_mobile_rec`, from https://huggingface.co/monkt/paddleocr-onnx, `languages/english/`).

Loaded by `src/lib/scan/scanner.ts` only when the phone app's scanner opens; not part of the desktop build.

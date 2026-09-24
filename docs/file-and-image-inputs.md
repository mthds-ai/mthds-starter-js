# File and image inputs

Text inputs are plain strings, passed to the method as they are. A file input, which the PDF example demonstrates, takes one extra step, and a generated image comes back in a form the page can render directly.

## A file going in

1. The browser reads the chosen `File` into a base64 data URL with `fileToDataUrl` (`src/lib/clientFile.ts`). A `File` cannot cross the boundary between the browser and a Server Action, so the action receives only the resulting string and the file name.
2. The Server Action validates the data URL with `validateDataUrl` (`src/lib/fileEncoding.ts`), which checks its MIME type and its size. The browser may check both first to answer faster, but the action's check is the one that counts, since a browser check is easy to bypass.
3. The action wraps the data URL in an MTHDS `Document` input with `buildDocumentInput`: `{ concept: "Document", content: { url, filename, mime_type } }`. An image input takes the same shape with `concept: "Image"`.
4. The MTHDS API decodes the data URL itself, so the app never hosts the file.

Next.js limits the body of a Server Action to 1 MB by default, and base64 makes a file about a third larger. `next.config.js` raises `serverActions.bodySizeLimit`, and `MAX_PDF_BYTES` in `src/lib/fileEncoding.ts` caps the size of the raw file below it with a margin. Change both together.

## An image coming out

A method that produces a file, such as the image example, returns it as a URL in its output: a storage URL or a base64 data URL. The `parseGeneratedImage()` narrower in `src/types/generateImagePipeline.ts` extracts it, and `src/components/ImageResult.tsx` renders it in an `<img>`.

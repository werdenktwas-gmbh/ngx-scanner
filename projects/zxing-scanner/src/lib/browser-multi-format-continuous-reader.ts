import { ChecksumException, FormatException, NotFoundException } from '@zxing/library';
import { HTMLCanvasElementLuminanceSource } from '@zxing/browser/esm/common/HTMLCanvasElementLuminanceSource';
import { BinaryBitmap, HybridBinarizer, Result } from '@zxing/library';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BehaviorSubject, Observable } from 'rxjs';
import { ResultAndError } from './ResultAndError';

/**
 * Based on zxing-typescript BrowserCodeReader
 */
export class BrowserMultiFormatContinuousReader extends BrowserMultiFormatReader {

  /**
   * Allows to call scanner controls API while scanning.
   * Will be undefined if no scanning is running.
   */
  protected scannerControls: IScannerControls;

  /**
   * HOTFIX for qr code prints with low contrast
   */

  private static toggleLuminanceInvert = false

  static createBinaryBitmapFromCanvas(canvas: HTMLCanvasElement) {
    // Invert luminance on every other frame, to ensure both black-on-white and white-on-black codes work eventually
    this.toggleLuminanceInvert = !this.toggleLuminanceInvert;
    const luminanceInvert = this.toggleLuminanceInvert;

    const luminanceSource = new HTMLCanvasElementLuminanceSource(canvas);
    const invertedSource = luminanceInvert ? luminanceSource.invert() : luminanceSource;
    const hybridBinarizer = new HybridBinarizer(invertedSource);
    //console.log("using patched ngx-scanner");
    return new BinaryBitmap(hybridBinarizer);
  }

  override decodeFromCanvas(canvas: HTMLCanvasElement): Result {
    // Use override version of createBinaryBitmapFromCanvas
    const binaryBitmap = BrowserMultiFormatContinuousReader.createBinaryBitmapFromCanvas(canvas);
    return this.decodeBitmap(binaryBitmap);
  }

  /**
   * HOTFIX END
   */

  /**
   * Returns the code reader scanner controls.
   */
  public getScannerControls(): IScannerControls {
    if (!this.scannerControls) {
      throw new Error('No scanning is running at the time.');
    }
    return this.scannerControls;
  }

  /**
   * Starts the decoding from the current or a new video element.
   *
   * @param deviceId The device's to be used Id
   * @param previewEl A new video element
   */
  public async scanFromDeviceObservable(
    deviceId?: string,
    previewEl?: HTMLVideoElement
  ): Promise<Observable<ResultAndError>> {

    const scan$ = new BehaviorSubject<ResultAndError>({});
    let ctrls;

    try {
      ctrls = await this.decodeFromVideoDevice(deviceId, previewEl, (result, error) => {

        if (!error) {
          scan$.next({ result });
          return;
        }

        const errorName = error.name;

        // stream cannot stop on fails.
        if (
          // scan Failure - found nothing, no error
          errorName === NotFoundException.name ||
          // scan Error - found the QR but got error on decoding
          errorName === ChecksumException.name ||
          errorName === FormatException.name ||
          error.message.includes('No MultiFormat Readers were able to detect the code.')
        ) {
          scan$.next({ error });
          return;
        }

        // probably fatal error
        scan$.error(error);
        this.scannerControls.stop();
        this.scannerControls = undefined;
        return;
      });

      this.scannerControls = {
        ...ctrls,
        stop() {
          ctrls.stop();
          scan$.complete();
        },
      };
    } catch (e) {
      scan$.error(e);
      this.scannerControls?.stop();
      this.scannerControls = undefined;
    }

    return scan$.asObservable();
  }
}

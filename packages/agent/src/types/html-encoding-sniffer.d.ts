declare module 'html-encoding-sniffer' {
  type SniffOptions = {
    xml?: boolean
    transportLayerEncodingLabel?: string
    defaultEncoding?: string
  }

  export default function sniffHTMLEncoding(bytes: Uint8Array, options?: SniffOptions): string
}

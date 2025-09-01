// declare module 'tsne-js' {
//   export class TSNE {
//     constructor(config: {
//       dim: number;
//       perplexity: number;
//       earlyExaggeration: number;
//       learningRate: number;
//       nIter: number;
//       metric: string;
//     });

//     init(data: { data: number[][]; type: 'dense' | 'sparse' }): void;
//     run(): void;
//     getOutputScaled(): [number, number][];
//   }
// }

declare module 'tsne-js' {
  const TSNE: any; 
  export default TSNE;
}

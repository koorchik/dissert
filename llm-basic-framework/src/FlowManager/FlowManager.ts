interface FlowStep {
  name: string;
  run: () => Promise<void>;
}

interface FlowManagerParams {
  steps: FlowStep[]
}

export class FlowManager {
  #steps: FlowStep[];

  constructor(params: FlowManagerParams) {
    this.#steps = params.steps;
  }

  async runAllSteps() {
    for (const step of this.#steps) {
      console.log(`Running step ${step.name}`);
      await this.runStep(step.name);
    }
  }

  async runStep(stepName: string) {
    const step = this.#steps.find(step => step.name === stepName);

    if (!step) {
      throw new Error(`Step ${stepName} not found`);
    }

    await step.run();
  }
}
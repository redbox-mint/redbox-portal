import {
  createNoopMeter,
  metrics,
  type Attributes,
  type Counter,
  type Histogram,
  type Meter,
  type MeterProvider,
} from '@opentelemetry/api';

export interface CapturedOpenTelemetryMeasurement {
  readonly name: string;
  readonly value: number;
  readonly attributes: Attributes;
}

const capturedOpenTelemetryMeasurements: CapturedOpenTelemetryMeasurement[] = [];
const noopMeter = createNoopMeter();
const capturingMeter: Meter = new Proxy(noopMeter, {
  get(target, property, receiver) {
    if (property === 'createCounter') {
      return (name: string): Counter => ({
        add: (value, attributes = {}) => {
          capturedOpenTelemetryMeasurements.push({ name, value, attributes: { ...attributes } });
        },
      });
    }
    if (property === 'createHistogram') {
      return (name: string): Histogram => ({
        record: (value, attributes = {}) => {
          capturedOpenTelemetryMeasurements.push({ name, value, attributes: { ...attributes } });
        },
      });
    }
    return Reflect.get(target, property, receiver);
  },
});
const capturingMeterProvider: MeterProvider = {
  getMeter: name =>
    name === 'redbox.record-validation' || name === 'redbox.record-schema' ? capturingMeter : noopMeter,
};
if (!metrics.setGlobalMeterProvider(capturingMeterProvider)) {
  throw new Error('The core test suite could not install its OpenTelemetry meter provider.');
}

export function clearCapturedOpenTelemetryMeasurements(): void {
  capturedOpenTelemetryMeasurements.length = 0;
}

export function getCapturedOpenTelemetryMeasurements(): readonly CapturedOpenTelemetryMeasurement[] {
  return capturedOpenTelemetryMeasurements.map(measurement => ({
    ...measurement,
    attributes: { ...measurement.attributes },
  }));
}

// Domains receive explicit fixture inputs; module evaluation installs no framework globals.

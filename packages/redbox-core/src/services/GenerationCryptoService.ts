import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Services as services } from '../CoreService';
import { GenerationError } from '../model/generation';
import { requireService } from './generation/require-service';

export interface GenerationEncryptedEnvelope {
  payloadVersion: 1;
  encryptionKeyId: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

interface SecretResolverLike { resolve(secretRef: string): Promise<string>; }

export namespace Services {
  export class GenerationCryptoService extends services.Core.Service {
    protected override _exportedMethods = ['encrypt', 'decrypt'];

    private async key(): Promise<{ id: string; value: Buffer }> {
      const config = sails.config.generation.artifacts;
      const resolver = requireService<SecretResolverLike>('generationsecretresolverservice', ['resolve']);
      const raw = await resolver.resolve(config.encryptionKeyRef);
      const value = /^[0-9a-f]{64}$/i.test(raw)
        ? Buffer.from(raw, 'hex')
        : Buffer.from(raw, 'base64');
      if (value.length !== 32) {
        throw new GenerationError('GENERATION_NOT_CONFIGURED', 'Generation encryption key must contain exactly 256 bits');
      }
      return { id: config.encryptionKeyId, value };
    }

    public async encrypt(brandId: string, runId: string, payload: unknown): Promise<GenerationEncryptedEnvelope> {
      const key = await this.key();
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key.value, iv);
      cipher.setAAD(Buffer.from(`${brandId}:${runId}:1`, 'utf8'));
      const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const authTag = cipher.getAuthTag();
      plaintext.fill(0);
      key.value.fill(0);
      return {
        payloadVersion: 1,
        encryptionKeyId: key.id,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        ciphertext: ciphertext.toString('base64'),
      };
    }

    public async decrypt<T>(brandId: string, runId: string, envelope: GenerationEncryptedEnvelope): Promise<T> {
      if (envelope.payloadVersion !== 1) {
        throw new GenerationError('GENERATION_ARTIFACT_EXPIRED', 'Unsupported generation artifact version');
      }
      const key = await this.key();
      if (key.id !== envelope.encryptionKeyId) {
        key.value.fill(0);
        throw new GenerationError('GENERATION_ARTIFACT_EXPIRED', 'Generation artifact key is unavailable');
      }
      try {
        const decipher = createDecipheriv('aes-256-gcm', key.value, Buffer.from(envelope.iv, 'base64'));
        decipher.setAAD(Buffer.from(`${brandId}:${runId}:1`, 'utf8'));
        decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
        const plaintext = Buffer.concat([
          decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
          decipher.final(),
        ]);
        const value = JSON.parse(plaintext.toString('utf8')) as T;
        plaintext.fill(0);
        return value;
      } catch {
        throw new GenerationError('GENERATION_ARTIFACT_EXPIRED', 'Generation artifact could not be decrypted');
      } finally {
        key.value.fill(0);
      }
    }
  }
}

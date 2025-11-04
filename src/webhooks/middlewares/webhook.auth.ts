// src/webhooks/middlewares/webhook.auth.ts

import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

@Injectable()
export class sumsubWebhookAuth implements NestMiddleware {
  constructor() {}

  async use(req: Request, res: Response, next: NextFunction) {
    console.log('middleware');

    try {
      const webhookSecret = '51DeNriDwPmKc8oLiWJDepONmKt';

      if (!req.headers) {
        return res
          .status(401)
          .send({ status: 'failed', message: 'invalid token' });
      }

      const digestAlgorithm: string = req.headers[
        'x-payload-digest-alg'
      ] as string;
      const payloadDigest = req.headers['x-payload-digest'] as string;

      // Skip verification if no signature headers present
      if (!digestAlgorithm || !payloadDigest) {
        console.log('No signature headers present, skipping verification');
        return next();
      }

      const algo = {
        HMAC_SHA1_HEX: 'sha1',
        HMAC_SHA256_HEX: 'sha256',
        HMAC_SHA512_HEX: 'sha512',
      }[digestAlgorithm];

      if (!algo) {
        return res
          .status(401)
          .send({ status: 'failed', message: 'invalid algorithm' });
      }

      // Use raw body for signature verification
      const rawBody = (req as any).rawBody;

      if (!rawBody) {
        console.error('Raw body not available for signature verification');
        return res
          .status(401)
          .send({ status: 'failed', message: 'raw body required' });
      }

      console.log('Webhook verification:', {
        algorithm: algo,
        bodyLength: rawBody.length,
        expectedDigest: payloadDigest,
      });

      // Try different approaches to signature calculation
      const approaches = [
        { name: 'Raw buffer', data: rawBody },
        { name: 'UTF8 string', data: rawBody.toString('utf8') },
        { name: 'No encoding', data: rawBody.toString() },
      ];

      let verified = false;

      for (const approach of approaches) {
        const calculatedDigest = crypto
          .createHmac(algo, webhookSecret)
          .update(approach.data)
          .digest('hex');

        console.log(`${approach.name} signature:`, {
          calculated: calculatedDigest,
          provided: payloadDigest,
          match: calculatedDigest === payloadDigest,
        });

        if (calculatedDigest === payloadDigest) {
          console.log(`✅ Signature verified using: ${approach.name}`);
          verified = true;
          break;
        }
      }

      // ✅ STRICT: Block request if signature doesn't match
      if (!verified) {
        console.error('❌ Signature verification failed - BLOCKING REQUEST');
        return res.status(401).send({
          status: 'failed',
          message: 'invalid signature - webhook authentication failed',
        });
      }

      console.log('✅ Webhook signature verified successfully');
      next();
    } catch (error) {
      console.error('Webhook auth error:', error);
      return res.status(500).send({
        status: 'failed',
        message: 'webhook authentication error',
      });
    }
  }
}

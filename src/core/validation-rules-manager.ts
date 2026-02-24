/**
 * Validation rules manager — per-project rule configuration.
 *
 * Adapted from glean-connector-studio. Uses .glean/validation-rules.json
 * instead of .glean-studio/validation-rules.json.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getLogger } from '../lib/logger.js';
import { atomicWriteFileSync } from './fs-utils.js';
import {
  IssueSeverity,
  ValidationRuleCode,
  type ValidationRuleConfig,
  type ValidationRulesConfiguration,
} from '../types/index.js';

const logger = getLogger('validation-rules');

const VALIDATION_RULES_FILE = '.glean/validation-rules.json';

export class ValidationRulesManager {
  private rulesFile: string;

  constructor(projectPath: string) {
    this.rulesFile = join(projectPath, VALIDATION_RULES_FILE);
  }

  getDefaultRules(): ValidationRulesConfiguration {
    const codes = Object.values(ValidationRuleCode);
    const rules: ValidationRuleConfig[] = codes.map((code) => ({
      code,
      enabled: true,
      severity: IssueSeverity.WARNING,
    }));
    return { rules };
  }

  load(): ValidationRulesConfiguration {
    if (!existsSync(this.rulesFile)) {
      logger.debug({ path: this.rulesFile }, 'No validation rules file, using defaults');
      return this.getDefaultRules();
    }

    try {
      const data = JSON.parse(
        readFileSync(this.rulesFile, 'utf-8'),
      ) as ValidationRulesConfiguration;
      logger.info({ ruleCount: data.rules.length, path: this.rulesFile }, 'Loaded validation rules');
      return data;
    } catch (e) {
      logger.error(
        { path: this.rulesFile, err: e },
        'Failed to load validation rules, using defaults',
      );
      return this.getDefaultRules();
    }
  }

  save(config: ValidationRulesConfiguration): void {
    atomicWriteFileSync(this.rulesFile, JSON.stringify(config, null, 2));
    logger.info({ ruleCount: config.rules.length, path: this.rulesFile }, 'Saved validation rules');
  }
}

const evidence = {
  type: 'object',
  additionalProperties: false,
  required: ['source_id', 'source_label', 'page_number', 'excerpt'],
  properties: {
    source_id: { type: 'string' },
    source_label: { type: 'string' },
    page_number: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    excerpt: { type: 'string' }
  }
};

export const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'sources', 'clarity_state', 'dimensions', 'contradictions', 'claim_gaps', 'clarity_strength', 'operational_consequences', 'preliminary_sprint_case', 'confidence', 'source_warnings'],
  properties: {
    status: { type: 'string', enum: ['complete', 'insufficient_evidence'] },
    sources: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['source_id', 'label', 'usable'],
        properties: { source_id: { type: 'string' }, label: { type: 'string' }, usable: { type: 'boolean' } }
      }
    },
    clarity_state: {
      type: 'array', minItems: 5, maxItems: 5,
      items: {
        type: 'object', additionalProperties: false,
        required: ['element', 'status', 'note', 'evidence'],
        properties: {
          element: { type: 'string', enum: ['audience', 'problem', 'outcome', 'difference', 'proof'] },
          status: { type: 'string', enum: ['clearly_present', 'present_generic', 'conflicting', 'not_found'] },
          note: { type: 'string' },
          evidence: { type: 'array', minItems: 1, maxItems: 3, items: evidence }
        }
      }
    },
    dimensions: {
      type: 'array', minItems: 6, maxItems: 6,
      items: {
        type: 'object', additionalProperties: false,
        required: ['name', 'level', 'explanation', 'evidence'],
        properties: {
          name: { type: 'string', enum: ['audience_boundary', 'problem_trigger', 'outcome_value', 'difference', 'proof_boundaries', 'consistency'] },
          level: { type: 'string', enum: ['clear', 'partial', 'weak', 'absent'] },
          explanation: { type: 'string' },
          evidence: { type: 'array', minItems: 1, maxItems: 3, items: evidence }
        }
      }
    },
    contradictions: {
      type: 'array', maxItems: 5,
      items: {
        type: 'object', additionalProperties: false,
        required: ['dimension', 'material', 'why_it_matters', 'evidence'],
        properties: {
          dimension: { type: 'string', enum: ['audience_boundary', 'problem_trigger', 'outcome_value', 'difference', 'proof_boundaries', 'consistency'] },
          material: { type: 'boolean' }, why_it_matters: { type: 'string' },
          evidence: { type: 'array', minItems: 2, maxItems: 3, items: evidence }
        }
      }
    },
    claim_gaps: {
      type: 'array', maxItems: 5,
      items: {
        type: 'object', additionalProperties: false,
        required: ['kind', 'claim', 'why_it_matters', 'evidence'],
        properties: {
          kind: { type: 'string', enum: ['unproven', 'generic', 'over_broad'] },
          claim: { type: 'string' }, why_it_matters: { type: 'string' }, evidence
        }
      }
    },
    clarity_strength: {
      type: 'array', maxItems: 3,
      items: {
        type: 'object', additionalProperties: false,
        required: ['observation', 'evidence'],
        properties: { observation: { type: 'string' }, evidence }
      }
    },
    operational_consequences: { type: 'array', maxItems: 4, items: { type: 'string' } },
    preliminary_sprint_case: {
      type: 'object', additionalProperties: false,
      required: ['level', 'explanation'],
      properties: {
        level: { type: 'string', enum: ['strong_case', 'possible_case', 'limited_case', 'cannot_determine'] },
        explanation: { type: 'string' }
      }
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    source_warnings: { type: 'array', maxItems: 5, items: { type: 'string' } }
  }
};

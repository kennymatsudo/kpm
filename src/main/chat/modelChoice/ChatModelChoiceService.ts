import type { IChatSessionRepository } from '../../db/interfaces';
import type {
  ChatChoiceEffort,
  ChatChoiceView,
  ChatProvider,
  ChatProviderDescriptor,
  PersistedChatModelChoice,
  PiProviderOption,
  ProvidersReadiness,
} from '../../../shared/types';
import { failure, success, type AsyncResult, type ServiceResult } from '../../services/result';
import {
  buildChatChoiceCatalog,
  ensureSelectedModelVisible,
  findModel,
  findProvider,
  UNSELECTED_PI_MODEL_ID,
} from './policy';
import type {
  ChatChoiceChangeInput,
  ChatChoiceOpenInput,
  ChatModelChoiceService,
  ResolvedChatChoice,
} from './types';

export interface ChatModelChoiceDefaults {
  provider: ChatProvider;
  models: {
    claude: string;
    codex: string;
    /** Null means no pi default has ever been configured. */
    pi: string | null;
  };
  effort: ChatChoiceEffort;
}

export interface ChatModelChoiceDeps {
  chatSessions: IChatSessionRepository;
  getDefaults: () => ChatModelChoiceDefaults;
  getReadiness: () => Promise<ProvidersReadiness>;
  listPiProviders: () => Promise<PiProviderOption[]>;
}

function isProvider(value: unknown): value is ChatProvider {
  return value === 'claude' || value === 'codex' || value === 'pi';
}

function isEffort(value: unknown): value is ChatChoiceEffort | null {
  return value === null || (typeof value === 'string'
    && ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(value));
}

function parseAggregate(raw: string): PersistedChatModelChoice | undefined {
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedChatModelChoice>;
    if (parsed.version !== 1 || !isProvider(parsed.selectedProvider) || !parsed.remembered) return undefined;
    for (const provider of ['claude', 'codex', 'pi'] as const) {
      const remembered = parsed.remembered[provider];
      if (!remembered || typeof remembered.model !== 'string' || !isEffort(remembered.effort)) return undefined;
    }
    return parsed as PersistedChatModelChoice;
  } catch {
    return undefined;
  }
}

function supportedEffort(
  model: { effortLevels: { value: ChatChoiceEffort }[]; defaultEffort: ChatChoiceEffort | null },
  desired: ChatChoiceEffort,
): ChatChoiceEffort | null {
  return model.effortLevels.some((level) => level.value === desired)
    ? desired
    : model.defaultEffort;
}

function createSnapshot(
  defaults: ChatModelChoiceDefaults,
  providers: ChatProviderDescriptor[],
  piOptions: PiProviderOption[],
  selectedProvider = defaults.provider,
): PersistedChatModelChoice {
  const configuredPiModel = defaults.models.pi;
  const inheritedPiModel = configuredPiModel ?? piOptions
    .filter((option) => option.safe)
    .map((option) => `${option.provider}/${option.modelId}`)
    .find((selector) => findModel(providers, 'pi', selector)?.available)
    ?? UNSELECTED_PI_MODEL_ID;
  const defaultModels: Record<ChatProvider, string> = {
    claude: defaults.models.claude,
    codex: defaults.models.codex,
    pi: inheritedPiModel,
  };
  const remembered = Object.fromEntries((['claude', 'codex', 'pi'] as const).map((provider) => {
    const modelId = defaultModels[provider];
    const model = findModel(providers, provider, modelId);
    return [provider, {
      model: modelId,
      effort: model ? supportedEffort(model, defaults.effort) : defaults.effort,
    }];
  })) as PersistedChatModelChoice['remembered'];
  return { version: 1, selectedProvider, remembered };
}

function selectedModel(aggregate: PersistedChatModelChoice) {
  return aggregate.remembered[aggregate.selectedProvider];
}

function buildView(
  aggregate: PersistedChatModelChoice,
  revision: number,
  catalog: ChatProviderDescriptor[],
  responding: boolean,
): ChatChoiceView {
  const remembered = selectedModel(aggregate);
  const providers = ensureSelectedModelVisible(catalog, aggregate.selectedProvider, remembered.model);
  const provider = findProvider(providers, aggregate.selectedProvider);
  const model = findModel(providers, aggregate.selectedProvider, remembered.model)!;
  const reason = !provider.available
    ? `${provider.label} is unavailable: ${provider.detail}. Choose an available provider or finish its setup.`
    : !model.available
      ? model.unavailableReason ?? `The saved model “${remembered.model}” is unavailable. Choose another model.`
      : undefined;

  return {
    revision,
    selected: {
      provider: aggregate.selectedProvider,
      model: remembered.model,
      effort: remembered.effort,
    },
    remembered: aggregate.remembered,
    providers,
    controlsEnabled: !responding,
    responding,
    send: reason ? { allowed: false, reason } : { allowed: true },
  };
}

export function createChatModelChoiceService(deps: ChatModelChoiceDeps): ChatModelChoiceService {
  async function loadCatalog(): Promise<{
    catalog: ChatProviderDescriptor[];
    piProviders: PiProviderOption[];
  }> {
    const [readiness, piProviders] = await Promise.all([
      deps.getReadiness(),
      deps.listPiProviders(),
    ]);
    return { catalog: buildChatChoiceCatalog(readiness, piProviders), piProviders };
  }

  function persist(
    chatSessionId: string,
    expectedRevision: number,
    aggregate: PersistedChatModelChoice,
  ) {
    return deps.chatSessions.updateModelChoice(
      chatSessionId,
      expectedRevision,
      JSON.stringify(aggregate),
    );
  }

  function readAuthoritativeAggregate(chatSessionId: string, projectId: string): ServiceResult<{
    row: NonNullable<ReturnType<IChatSessionRepository['get']>>;
    aggregate: PersistedChatModelChoice;
  }> {
    const row = deps.chatSessions.get(chatSessionId);
    if (!row) return failure('Chat model choice changed while it was opening, but the Chat no longer exists.');
    if (row.project_id !== projectId) return failure('Chat does not belong to this project');
    if (!row.chat_model_choice) {
      return failure('Chat model choice changed while it was opening, but no saved model choice is available.');
    }
    const aggregate = parseAggregate(row.chat_model_choice);
    if (!aggregate) return failure('This Chat has an invalid saved model choice. Reset or repair the Chat before sending.');
    return success({ row, aggregate });
  }

  async function open(input: ChatChoiceOpenInput): AsyncResult<ChatChoiceView> {
    try {
      const { catalog, piProviders } = await loadCatalog();
      let row = deps.chatSessions.get(input.chatSessionId);
      if (!row) {
        try {
          row = input.scope === 'focus_document'
            ? deps.chatSessions.createFocusDocument(
                input.chatSessionId,
                input.projectId,
                input.focusDocument.path,
                input.focusDocument.title,
                input.focusDocument.contentHash,
                deps.getDefaults().provider,
              )
            : deps.chatSessions.create(input.chatSessionId, input.projectId, deps.getDefaults().provider);
        } catch (createError) {
          // A concurrent first open may have inserted the row after our read.
          row = deps.chatSessions.get(input.chatSessionId);
          if (!row) throw createError;
        }
      }
      if (row.project_id !== input.projectId) return failure('Chat does not belong to this project');

      let aggregate = row.chat_model_choice ? parseAggregate(row.chat_model_choice) : undefined;
      if (row.chat_model_choice && !aggregate) return failure('This Chat has an invalid saved model choice. Reset or repair the Chat before sending.');

      if (!aggregate) {
        const defaults = deps.getDefaults();
        // Legacy rows preserve their native provider and adopt that provider's
        // configured model/effort exactly once.
        aggregate = createSnapshot(defaults, catalog, piProviders, row.provider ?? defaults.provider);
        const updated = persist(row.id, row.chat_model_choice_revision ?? 0, aggregate);
        if (updated) {
          row = updated;
        } else {
          const authoritative = readAuthoritativeAggregate(row.id, input.projectId);
          if (!authoritative.ok) return authoritative;
          row = authoritative.data.row;
          aggregate = authoritative.data.aggregate;
        }
      }

      const active = selectedModel(aggregate);
      const model = findModel(catalog, aggregate.selectedProvider, active.model);
      if (model && active.effort !== model.defaultEffort && !model.effortLevels.some((level) => level.value === active.effort)) {
        const normalized = {
          ...aggregate,
          remembered: {
            ...aggregate.remembered,
            [aggregate.selectedProvider]: { ...active, effort: model.defaultEffort },
          },
        };
        const updated = persist(row.id, row.chat_model_choice_revision ?? 0, normalized);
        if (updated) {
          row = updated;
          aggregate = normalized;
        } else {
          const authoritative = readAuthoritativeAggregate(row.id, input.projectId);
          if (!authoritative.ok) return authoritative;
          row = authoritative.data.row;
          aggregate = authoritative.data.aggregate;
        }
      }

      return success(buildView(aggregate, row.chat_model_choice_revision ?? 0, catalog, input.responding ?? false));
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  }

  async function change(input: ChatChoiceChangeInput): AsyncResult<ChatChoiceView> {
    try {
      const row = deps.chatSessions.get(input.chatSessionId);
      if (row?.project_id !== input.projectId) return failure('Chat not found');
      if ((row.chat_model_choice_revision ?? 0) !== input.expectedRevision) {
        return failure('Chat model choice changed in another view. Reload the Chat and try again.');
      }
      if (!row.chat_model_choice) return failure('Open the Chat before changing its model choice.');
      const current = parseAggregate(row.chat_model_choice);
      if (!current) return failure('This Chat has an invalid saved model choice.');
      const { catalog } = await loadCatalog();
      let next = current;

      switch (input.intent.type) {
        case 'choose_provider':
          next = { ...current, selectedProvider: input.intent.provider };
          break;
        case 'choose_model': {
          const descriptor = findModel(catalog, current.selectedProvider, input.intent.model);
          if (!descriptor) return failure(`Model “${input.intent.model}” is not available for ${current.selectedProvider}.`);
          const remembered = current.remembered[current.selectedProvider];
          const effort = descriptor.effortLevels.some((level) => level.value === remembered.effort)
            ? remembered.effort
            : descriptor.defaultEffort;
          next = {
            ...current,
            remembered: {
              ...current.remembered,
              [current.selectedProvider]: { model: descriptor.id, effort },
            },
          };
          break;
        }
        case 'choose_effort': {
          const remembered = current.remembered[current.selectedProvider];
          const requestedEffort = input.intent.effort;
          const descriptor = findModel(catalog, current.selectedProvider, remembered.model);
          if (!descriptor?.effortLevels.some((level) => level.value === requestedEffort)) {
            return failure(`Effort “${requestedEffort}” is not supported by ${remembered.model}.`);
          }
          next = {
            ...current,
            remembered: {
              ...current.remembered,
              [current.selectedProvider]: { ...remembered, effort: requestedEffort },
            },
          };
          break;
        }
      }

      const updated = persist(row.id, input.expectedRevision, next);
      if (!updated) return failure('Chat model choice changed in another view. Reload the Chat and try again.');
      return success(buildView(next, updated.chat_model_choice_revision ?? input.expectedRevision + 1, catalog, input.responding ?? false));
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  }

  async function resolveForTurn(projectId: string, chatSessionId: string): AsyncResult<ResolvedChatChoice> {
    const row = deps.chatSessions.get(chatSessionId);
    let input: ChatChoiceOpenInput = { projectId, chatSessionId, scope: 'main' };
    if (row?.scope === 'focus_document') {
      if (!row.focus_document_path || !row.focus_document_title || !row.focus_document_hash) {
        return failure('Focused Chat metadata is missing. Reopen the document Chat before sending.');
      }
      input = {
        projectId,
        chatSessionId,
        scope: 'focus_document',
        focusDocument: {
          path: row.focus_document_path,
          title: row.focus_document_title,
          contentHash: row.focus_document_hash,
        },
      };
    }
    const opened = await open(input);
    if (!opened.ok) return opened;
    if (!opened.data.send.allowed) return failure(opened.data.send.reason ?? 'The saved Chat model choice is unavailable.');
    return success({ ...opened.data.selected, revision: opened.data.revision });
  }

  return { open, change, resolveForTurn };
}


interface Props {
  projectId: string;
  associationId: string;
  onClose: () => void;
  onExportComplete: () => void;
}

export function SyncReviewModal({ projectId, associationId, onClose, onExportComplete }: Props) {
  const {
    phase,
    items,
    exportResult,
    error,
    startReview,
    setDecision,
    executeApproved,
    removeFromReview,
    reset,
  } = useSyncReviewStore();

  // Start review on mount
  useEffect(() => {
    return () => reset();

  };

  };

    }
  };

  const handleExecute = async () => {
    const result = await executeApproved(projectId, associationId);
      onExportComplete();
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // Loading state
  if (phase === 'loading') {
    return (
        </div>
    );
  }

  // Error with no items
  if (error && items.length === 0) {
    return (
          </div>
        </div>
    );
  }

  // Empty queue
  if (items.length === 0) {
    return (
          </div>
        </div>
    );
  }

  // Complete state
  if (phase === 'complete' && exportResult) {
    const successCount = exportResult.created.length + exportResult.updated.length;
    const failureCount = exportResult.errors.length;

    return (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          </p>
          )}
            </div>
          )}
        </div>
    );
  }


            </div>

            </div>

            </div>
          )}
        </div>

          <button
            disabled={isExporting}
          >
          </button>
          <button
            onClick={handleExecute}
          >
            {isExporting ? (
              <>
                <span>Exporting...</span>
              </>
            ) : (
              <>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </>
            )}
          </button>
        </div>
}


  children: React.ReactNode;
  onClose: () => void;
}

  return (
              </svg>
          </div>
        {children}
      </div>
  );
}

  item: SyncReviewItem;
}

  const isCreate = item.queueEntry.operation === 'create';

  return (
    >
        {!isCreate && item.planItem.external_key && (
        )}
      </div>
  );
}

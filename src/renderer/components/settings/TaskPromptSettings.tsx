import { useState, useEffect, useCallback } from 'react';

interface Props {
  currentProjectId?: string | null;
}

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form state
  const [name, setName] = useState('');

  const loadTemplates = useCallback(async () => {

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

    setName(template.name);
  };

  const clearForm = () => {
    setName('');
  };


    setName('');
  };

  const handleSave = async () => {
    if (!name.trim()) {
      return;
    }

    setIsSaving(true);

    try {
      } else {
      }
    } catch (e) {
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate) return;

    setIsDeleting(true);

    try {
      if (result.success) {
        clearForm();
      } else {
      }
    } catch (e) {
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSetDefault = async () => {
    if (!selectedTemplate) return;

    try {
      if (result.success && result.template) {
      } else {
      }
    } catch (e) {
    }
  };

  return (
      {/* Scope selector - only show if project is open */}
      {currentProjectId && (
            onClick={() => setScope('global')}
          >
            Global
            onClick={() => setScope('project')}
          >
            This Project
        </div>
      )}

        {/* Template list */}
            <button
              onClick={handleCreate}
            >
            </button>
          </div>

        </div>

        {/* Template editor */}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

            <textarea
            />
          </div>

          </div>

          {/* Actions */}
              {selectedTemplate && (
                <>
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                  </button>
                  {!selectedTemplate.is_default && (
                    <button
                      onClick={handleSetDefault}
                    >
                    </button>
                  )}
                </>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={isProcessing || !name.trim()}
              className="btn btn-primary"
            >
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner className="w-4 h-4" />
                  Saving...
                </span>
              ) : selectedTemplate ? (
                'Save Changes'
              ) : (
                'Create Template'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

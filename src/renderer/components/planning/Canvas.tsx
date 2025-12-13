import { PlanCard } from './PlanCard';

interface CanvasProps {
  projectId: string;
  items: PlanItem[];
  selectedItemIds: Set<string>;
  focusedItemId: string | null;
  /** Search query for filtering/highlighting cards */
  searchQuery?: string;
  onSelectItem: (itemId: string | null, addToSelection?: boolean) => void;
  onEditItem: (itemId: string) => void;
  onReparent: (itemIds: string[], newParentId: string | null) => Promise<void>;
  onUpdatePosition: (itemId: string, x: number, y: number) => void;
}

  projectId,
  items,
  selectedItemIds,
  focusedItemId,
  searchQuery = '',
  onSelectItem,
  onEditItem,
  onReparent,
  onUpdatePosition,
  onAutoLayout,
}: CanvasProps) {
  const {
    zoom,
    setZoom,
    panOffset,
    setPanOffset,
    isPanning,
    containerRef,
    resetView,
    screenToCanvas,
    panHandlers,


  const selectionSignaturesRef = useRef<Map<string, string>>(new Map());


  const selectionSignatures = useMemo(() => {
    const signatures = new Map<string, string>();
    const buildSignature = (node: TreeNode): string[] => {
      const collected: string[] = [];
      if (selectedItemIds.has(node.id)) {
        collected.push(node.id);
      }

      for (const child of node.children) {
        const childIds = buildSignature(child);
        if (childIds.length) {
          collected.push(...childIds);
        }
      }

      signatures.set(node.id, collected.join('|'));
      return collected;
    };

    itemsWithPositions.forEach(buildSignature);
    return signatures;
  }, [itemsWithPositions, selectedItemIds]);

  useEffect(() => {
    selectionSignaturesRef.current = selectionSignatures;
  }, [selectionSignatures]);


  const handleCardDrop = useCallback((droppedItemIds: string[], targetParentId: string) => {
    void onReparent(droppedItemIds, targetParentId);
  }, [onReparent]);

  const getSelectedIds = useCallback(() => selectionRef.current, []);
  const getSelectionSignature = useCallback((id: string) => selectionSignaturesRef.current.get(id) ?? '', []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden"
      onDragOver={handleDragOver}
      onDrop={(e) => {
        e.preventDefault();
        setDragPreview(null);
        void handleCanvasDrop(e);
      }}
      onDragEnd={() => {
      }}
      onClick={(e) => {
          onSelectItem(null);
        }
      }}
      onMouseMove={panHandlers.onMouseMove}
      onMouseUp={panHandlers.onMouseUp}
      onMouseLeave={panHandlers.onMouseLeave}
      style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
    >
      {/* Toolbar */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1 bg-surface-2 rounded-lg p-1 border border-border-default shadow-sm">
        <button
          onClick={() => setZoom(z => Math.max(ZOOM.MIN, z - ZOOM.STEP))}
          className="p-1.5 hover:bg-surface-3 rounded text-text-tertiary hover:text-text-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
        <span className="text-xs text-text-muted w-12 text-center font-mono">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom(z => Math.min(ZOOM.MAX, z + ZOOM.STEP))}
          className="p-1.5 hover:bg-surface-3 rounded text-text-tertiary hover:text-text-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <div className="w-px h-4 bg-border-subtle mx-1" />
        <button
          onClick={resetView}
          className="px-2 py-1 text-xs text-text-tertiary hover:text-text-primary hover:bg-surface-3 rounded transition-colors"
        >
        </button>
        <button
          onClick={() => {
          }}
        >
        </button>
      </div>

      {/* Transformed content layer */}
      <div
        className="absolute origin-top-left pointer-events-none"
        style={{
        }}
      >
        <AnimatePresence mode="popLayout">
              key={node.id}
              initial={{ opacity: 0, scale: 0.9 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              className="absolute pointer-events-auto"
              style={{
                left: node.position_x ?? 50,
                top: node.position_y ?? 50,
              }}
            >
              <PlanCard
                item={node}
                depth={0}
                isSelected={selectedItemIds.has(node.id)}
                isFocused={focusedItemId === node.id}
                focusedItemId={focusedItemId}
                searchQuery={searchQuery}
                selectionSignature={selectionSignatures.get(node.id) ?? ''}
                getSelectionSignature={getSelectionSignature}
                getSelectedIds={getSelectedIds}
                onSelectItem={onSelectItem}
                onEditItem={onEditItem}
                onDrop={handleCardDrop}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              />
        </AnimatePresence>
      </div>

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border-subtle flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-lg font-medium text-text-primary whitespace-nowrap">Start planning</p>
            <p className="text-sm mt-2 text-text-muted leading-relaxed">
              Ask Claude to break down your project into actionable work, or drag items from the backlog to get started.
            </p>
          </div>
        </div>
      )}

      {/* Pan hint */}
        Scroll to pan • ⌘+Scroll to zoom
      </div>

      {/* Drag preview */}
      {dragPreview && (
        <div
          style={{
            left: `${dragPreview.x - dragPreview.offsetX}px`,
            top: `${dragPreview.y - dragPreview.offsetY}px`,
            transformOrigin: 'top left',
          }}
        >
          {dragPreview.nodes.map(({ node, relativeX, relativeY }) => (
            <div
              key={node.id}
              className="absolute"
              style={{
                left: relativeX,
                top: relativeY,
              }}
            >
              <PlanCard
                item={node}
                depth={0}
                variant="preview"
                isSelected={false}
                isFocused={false}
                selectionSignature=""
                getSelectionSignature={getSelectionSignature}
                getSelectedIds={getSelectedIds}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );

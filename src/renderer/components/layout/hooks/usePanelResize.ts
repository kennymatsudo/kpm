import { PANEL_SIZES } from '../../../constants/layout';
import { useResizablePanel } from './useResizablePanel';

export interface UsePanelResizeReturn {
  sidebarWidth: number;
  chatWidth: number;
  handleSidebarResizeStart: (e: React.MouseEvent) => void;
  handleChatResizeStart: (e: React.MouseEvent) => void;
}

export function usePanelResize(): UsePanelResizeReturn {
  const sidebar = useResizablePanel(PANEL_SIZES.sidebar);
  const chat = useResizablePanel(PANEL_SIZES.planningChat, { reservedWidth: sidebar.width });

  return {
    sidebarWidth: sidebar.width,
    chatWidth: chat.width,
    handleSidebarResizeStart: sidebar.handleResizeStart,
    handleChatResizeStart: chat.handleResizeStart,
  };
}

import { useCallback, useEffect, useState } from 'react';

export type ChatMobileScreen = 'list' | 'thread';

export function useChatMobileNav(isMobile: boolean) {
  const [screen, setScreen] = useState<ChatMobileScreen>('list');
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);

  useEffect(() => {
    if (!isMobile) {
      setScreen('list');
      setNavDrawerOpen(false);
    }
  }, [isMobile]);

  const goToThread = useCallback(() => {
    if (!isMobile) return;
    setScreen('thread');
    if (window.history.state?.chatMobile !== 'thread') {
      window.history.pushState({ chatMobile: 'thread' }, '');
    }
  }, [isMobile]);

  const goToList = useCallback(() => {
    if (!isMobile) return;
    setScreen('list');
    setNavDrawerOpen(false);
    if (window.history.state?.chatMobile === 'thread') {
      window.history.back();
    }
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) return;
    const onPop = () => {
      setScreen('list');
      setNavDrawerOpen(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [isMobile]);

  return {
    screen,
    isList: screen === 'list',
    isThread: screen === 'thread',
    navDrawerOpen,
    setNavDrawerOpen,
    openNavDrawer: () => setNavDrawerOpen(true),
    closeNavDrawer: () => setNavDrawerOpen(false),
    goToThread,
    goToList,
  };
}

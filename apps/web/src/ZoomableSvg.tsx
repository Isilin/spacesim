import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";

/** Rectangle de vue SVG. */
export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  /** Cadrage initial, et cible du bouton « recentrer ». */
  home: ViewBox;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  /**
   * Cadrage imposé de l'extérieur (navigation : « aller à cette galaxie »). Change de
   * valeur → la vue s'y recale. `null` = laisser l'utilisateur maître de la vue.
   */
  focus?: ViewBox | null;
  /** Remonte le cadrage courant (rendu par niveau de détail — chantier 9.6). */
  onViewChange?: (view: ViewBox) => void;
}

/** Bornes de zoom, en facteur d'échelle par rapport au cadrage d'origine. */
const MIN_SCALE = 0.2;
const MAX_SCALE = 12;
const WHEEL_SENSITIVITY = 0.0015;

/**
 * Enveloppe SVG déplaçable et zoomable (chantier 9) : molette = zoom au curseur,
 * glisser = déplacement, double-clic = zoom avant, bouton = recentrage.
 *
 * Rendue nécessaire par l'univers infini — un `viewBox` figé ne peut plus cadrer une
 * carte sans bord — mais réutilisée par les trois niveaux (univers, galaxie, système).
 */
export function ZoomableSvg({
  home,
  children,
  className,
  ariaLabel,
  focus,
  onViewChange,
}: Props) {
  const [view, setView] = useState<ViewBox>(home);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const movedRef = useRef(false);

  const apply = useCallback(
    (next: ViewBox) => {
      setView(next);
      onViewChange?.(next);
    },
    [onViewChange],
  );

  // Changement de niveau de carte (ou de galaxie affichée) : on repart du cadrage d'accueil.
  useEffect(() => {
    setView(home);
    // `home` est recréé à chaque rendu par l'appelant : on ne suit que ses valeurs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home.x, home.y, home.width, home.height]);

  // Cadrage imposé par la navigation (recherche, « ma capitale »…).
  useEffect(() => {
    if (focus) setView(focus);
  }, [focus?.x, focus?.y, focus?.width, focus?.height]);

  /** Point du monde SVG sous le curseur. */
  const worldAt = (event: { clientX: number; clientY: number }, current: ViewBox) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: current.x + ((event.clientX - rect.left) / rect.width) * current.width,
      y: current.y + ((event.clientY - rect.top) / rect.height) * current.height,
    };
  };

  /**
   * Zoom d'un facteur `factor` (>1 = rapprocher) autour d'un point du monde, qui reste
   * immobile à l'écran. Le facteur est borné pour que l'échelle reste dans [MIN, MAX]
   * par rapport au cadrage d'accueil.
   */
  const zoomAround = (factor: number, anchor: { x: number; y: number }) => {
    const scale = home.width / view.width;
    const clamped = Math.min(MAX_SCALE / scale, Math.max(MIN_SCALE / scale, factor));
    if (clamped === 1) return;
    apply({
      x: anchor.x - (anchor.x - view.x) / clamped,
      y: anchor.y - (anchor.y - view.y) / clamped,
      width: view.width / clamped,
      height: view.height / clamped,
    });
  };

  /** Centre géométrique de la vue — ancre des boutons de zoom. */
  const center = () => ({ x: view.x + view.width / 2, y: view.y + view.height / 2 });

  const onWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    const anchor = worldAt(event, view);
    if (anchor) zoomAround(Math.exp(-event.deltaY * WHEEL_SENSITIVITY), anchor);
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    movedRef.current = false;
    svgRef.current?.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!drag || !rect || rect.width === 0) return;
    const dx = ((event.clientX - drag.x) / rect.width) * view.width;
    const dy = ((event.clientY - drag.y) / rect.height) * view.height;
    if (Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) > 3) {
      movedRef.current = true;
    }
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY };
    apply({ ...view, x: view.x - dx, y: view.y - dy });
  };

  const endDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      svgRef.current?.releasePointerCapture(event.pointerId);
      dragRef.current = null;
    }
  };

  return (
    <div className="zoomable">
      <svg
        ref={svgRef}
        className={className}
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        role="img"
        aria-label={ariaLabel}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        // Un déplacement de carte ne doit pas se terminer en clic sur le nœud survolé.
        onClickCapture={(event) => {
          if (!movedRef.current) return;
          movedRef.current = false;
          event.stopPropagation();
        }}
        // Le double-clic est réservé aux nœuds (ouvrir la sous-carte) : le zoom passe par
        // la molette et les boutons, sans quoi les deux gestes entraient en conflit.
      >
        {children}
      </svg>
      <div className="zoom-controls">
        <button type="button" title="Zoom avant" onClick={() => zoomAround(1.4, center())}>
          +
        </button>
        <button type="button" title="Zoom arrière" onClick={() => zoomAround(1 / 1.4, center())}>
          −
        </button>
        <button type="button" title="Recentrer" onClick={() => apply(home)}>
          ⊙
        </button>
      </div>
    </div>
  );
}

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import styles from "./zoomable-svg.module.css";

/** Rectangle de vue SVG. */
export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
}

export interface ZoomableSvgProps {
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
  /** Noms accessibles des boutons de contrôle (`aria-label`/`title`) — `packages/ui`
   *  reste agnostique de la traduction, l'appelant fournit les libellés dans sa locale. */
  zoomInLabel?: string;
  zoomOutLabel?: string;
  recenterLabel?: string;
}

/** Bornes de zoom, en facteur d'échelle par rapport au cadrage d'origine. */
const MIN_SCALE = 0.2;
const MAX_SCALE = 12;
const WHEEL_SENSITIVITY = 0.0015;

/**
 * Enveloppe SVG déplaçable et zoomable (chantier 9, promue au design system chantier
 * 21.6) : molette = zoom au curseur, glisser = déplacement, double-clic = zoom avant
 * (à la charge de l'appelant sur les nœuds), bouton = recentrage.
 *
 * Rendue nécessaire par l'univers infini — un `viewBox` figé ne peut plus cadrer une
 * carte sans bord — mais réutilisée par les trois niveaux (univers, galaxie, système) et
 * l'arbre de recherche. Le rendu des nœuds (SVG passé en `children`) reste dans
 * apps/web : cette enveloppe ne connaît rien du jeu, seulement pan/zoom.
 */
export function ZoomableSvg({
  home,
  children,
  className,
  ariaLabel,
  focus,
  onViewChange,
  zoomInLabel = "Zoom in",
  zoomOutLabel = "Zoom out",
  recenterLabel = "Recenter",
}: ZoomableSvgProps) {
  const [view, setView] = useState<ViewBox>(home);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
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
  const worldAt = (
    event: { clientX: number; clientY: number },
    current: ViewBox,
  ) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: current.x + ((event.clientX - rect.left) / rect.width) * current.width,
      y:
        current.y + ((event.clientY - rect.top) / rect.height) * current.height,
    };
  };

  /**
   * Zoom d'un facteur `factor` (>1 = rapprocher) autour d'un point du monde, qui reste
   * immobile à l'écran. Le facteur est borné pour que l'échelle reste dans [MIN, MAX]
   * par rapport au cadrage d'accueil.
   */
  const zoomAround = (factor: number, anchor: { x: number; y: number }) => {
    const scale = home.width / view.width;
    const clamped = Math.min(
      MAX_SCALE / scale,
      Math.max(MIN_SCALE / scale, factor),
    );
    if (clamped === 1) return;
    apply({
      x: anchor.x - (anchor.x - view.x) / clamped,
      y: anchor.y - (anchor.y - view.y) / clamped,
      width: view.width / clamped,
      height: view.height / clamped,
    });
  };

  /** Centre géométrique de la vue — ancre des boutons de zoom. */
  const center = () => ({
    x: view.x + view.width / 2,
    y: view.y + view.height / 2,
  });

  const onWheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    const anchor = worldAt(event, view);
    if (anchor) zoomAround(Math.exp(-event.deltaY * WHEEL_SENSITIVITY), anchor);
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
    };
    movedRef.current = false;
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!drag || !rect || rect.width === 0) return;
    const moved =
      Math.abs(event.clientX - drag.startX) +
        Math.abs(event.clientY - drag.startY) >
      3;
    if (!moved && !movedRef.current) return;
    if (!movedRef.current) {
      movedRef.current = true;
    }
    const dx = ((event.clientX - drag.x) / rect.width) * view.width;
    const dy = ((event.clientY - drag.y) / rect.height) * view.height;
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY };
    apply({ ...view, x: view.x - dx, y: view.y - dy });
  };

  const endDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  /** Alternative clavier au pan/zoom à la souris (chantier 27.21) : flèches pour se
   *  déplacer, +/- pour zoomer, 0 pour recentrer — utilisable une fois le SVG focus. */
  const onKeyDown = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    const PAN_STEP = 0.08;
    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        apply({ ...view, y: view.y - view.height * PAN_STEP });
        break;
      case "ArrowDown":
        event.preventDefault();
        apply({ ...view, y: view.y + view.height * PAN_STEP });
        break;
      case "ArrowLeft":
        event.preventDefault();
        apply({ ...view, x: view.x - view.width * PAN_STEP });
        break;
      case "ArrowRight":
        event.preventDefault();
        apply({ ...view, x: view.x + view.width * PAN_STEP });
        break;
      case "+":
      case "=":
        event.preventDefault();
        zoomAround(1.4, center());
        break;
      case "-":
      case "_":
        event.preventDefault();
        zoomAround(1 / 1.4, center());
        break;
      case "0":
        event.preventDefault();
        apply(home);
        break;
      default:
        break;
    }
  };

  return (
    <div className={styles.zoomable}>
      <svg
        ref={svgRef}
        className={className}
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        // "application" (pas "img") : depuis le clavier ajouté au chantier 27.21, ce n'est plus une image statique mais un widget avec son propre modèle d'interaction (flèches/±/0).
        role="application"
        aria-label={ariaLabel}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: svg n'est pas nativement interactif, mais role="application" ci-dessus en fait justement un widget clavier à part entière (pan/zoom) — le tabIndex est l'affordance requise, pas une erreur.
        tabIndex={0}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
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
      <div className={styles.controls}>
        <button
          type="button"
          title={zoomInLabel}
          aria-label={zoomInLabel}
          onClick={() => zoomAround(1.4, center())}
        >
          +
        </button>
        <button
          type="button"
          title={zoomOutLabel}
          aria-label={zoomOutLabel}
          onClick={() => zoomAround(1 / 1.4, center())}
        >
          −
        </button>
        <button
          type="button"
          title={recenterLabel}
          aria-label={recenterLabel}
          onClick={() => apply(home)}
        >
          ⊙
        </button>
      </div>
    </div>
  );
}

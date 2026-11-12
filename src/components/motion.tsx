"use client";
import { useEffect } from "react";

/**
 * Entradas ao rolar: elementos com `data-reveal` sobem e aparecem quando entram na tela.
 * - Sem JavaScript, ou com "reduzir movimento" ativo, nada fica escondido (o CSS só age com
 *   html[data-motion="on"]).
 * - O que já está visível ao abrir a página não pisca: é marcado como pronto, sem animação.
 * - Elementos que surgem depois (catálogo vindo do banco, filtros, navegação) também animam.
 */
export function Motion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const root = document.documentElement;
    const watched = new WeakSet<Element>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.1 });

    const scan = (initial: boolean) => {
      for (const element of document.querySelectorAll("[data-reveal]:not(.is-in)")) {
        if (watched.has(element)) continue;
        watched.add(element);
        if (initial) {
          const box = element.getBoundingClientRect();
          if (box.top < window.innerHeight && box.bottom > 0) { element.classList.add("is-in", "is-static"); continue; }
        }
        observer.observe(element);
      }
    };
    scan(true);
    root.dataset.motion = "on";

    let frame = 0;
    const mutations = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => scan(false));
    });
    mutations.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); mutations.disconnect(); cancelAnimationFrame(frame); delete root.dataset.motion; };
  }, []);
  return null;
}

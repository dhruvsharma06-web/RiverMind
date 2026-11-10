import { cn } from "@/lib/utils";

export function AbstractArt({
  variant = "river",
  className,
}: {
  variant?: "river" | "bloom" | "ripple";
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 600 340"
      preserveAspectRatio="xMidYMid slice"
      className={cn("abstract-art", className)}
      aria-hidden="true"
      focusable="false"
    >
      {variant === "river" ? (
        <>
          <path fill="#bfe7ee" d="M0 0h600v340H0z" />
          <circle cx="506" cy="48" r="162" fill="#d9ef9c" />
          <path
            d="M-80 336C50 52 206 402 344 122S606 48 696 158"
            fill="none"
            stroke="#2479a0"
            strokeWidth="155"
          />
          <path
            d="M-80 336C50 52 206 402 344 122S606 48 696 158"
            fill="none"
            stroke="#57c8bb"
            strokeWidth="61"
          />
          <circle cx="91" cy="64" r="33" fill="#fff1b9" />
          <path d="m471 237 27 30-27 30-27-30z" fill="#f4fffb" />
        </>
      ) : variant === "bloom" ? (
        <>
          <path fill="#f5e0b2" d="M0 0h600v340H0z" />
          <path d="M-40 0h314L120 340H-40z" fill="#e4b66f" />
          <path
            d="M304-80C440 40 94 135 267 390"
            fill="none"
            stroke="#8dd7c1"
            strokeWidth="125"
          />
          <circle cx="494" cy="241" r="155" fill="#256e8d" />
          <path d="M494 86v310M339 241h310" stroke="#6fc3cc" strokeWidth="55" />
          <circle cx="494" cy="241" r="46" fill="#d9ef9c" />
          <circle cx="85" cy="78" r="28" fill="#fff4dc" />
        </>
      ) : (
        <>
          <path fill="#a9ddd0" d="M0 0h600v340H0z" />
          <circle cx="123" cy="255" r="236" fill="#1f6683" />
          <circle cx="123" cy="255" r="179" fill="#65c6d9" />
          <circle cx="123" cy="255" r="119" fill="#c7e59d" />
          <circle cx="123" cy="255" r="57" fill="#edc778" />
          <path d="M350-38h190L352 378H166z" fill="#318ba0" />
          <path
            d="M551 44c-103 23-150 89-135 162s88 96 184 87v47H319c-6-112 47-267 232-296"
            fill="#e8f2bb"
          />
          <circle cx="511" cy="98" r="23" fill="#fff9eb" />
        </>
      )}
    </svg>
  );
}

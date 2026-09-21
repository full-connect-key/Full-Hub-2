type LogoProps = {
  /** "lg" para a tela de login, "sm" para o topo da sidebar. */
  size?: "sm" | "lg";
};

/** Marca do Full Hub. */
export function Logo({ size = "sm" }: LogoProps) {
  const lg = size === "lg";
  const box = lg ? "h-14 w-14 text-xl" : "h-9 w-9 text-sm";
  const text = lg ? "text-3xl" : "text-base";

  return (
    <span className={`flex items-center ${lg ? "flex-col gap-3" : "gap-2.5"}`}>
      <span
        aria-hidden
        className={`${box} grid place-items-center rounded-xl bg-fh-brand font-bold tracking-tight text-white`}
      >
        FH
      </span>
      <span className={`${text} font-semibold tracking-tight text-fh-text`}>Full Hub</span>
    </span>
  );
}

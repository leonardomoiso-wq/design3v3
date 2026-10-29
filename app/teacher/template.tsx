// Cambio di sezione nell'area docente: un filo ambra attraversa la
// pagina e il contenuto entra sfumando (versione leggera della "tendina"
// del Moiso design language). Il template si rimonta a ogni navigazione,
// il layout (con login e corso scelto) no.
export default function TemplateDocente({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span className="filo-sezione" aria-hidden="true" />
      <div className="app-shell-body entra-sezione flex-1 min-h-0 overflow-hidden flex flex-col">{children}</div>
    </>
  );
}

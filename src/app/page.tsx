export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="font-mono text-4xl font-semibold tracking-tight">
          DietKit
        </h1>
        <p className="text-lg text-balance opacity-80">
          Seus dados corporais viram metas de energia, e a dieta é montada com a
          tabela TACO — tudo no seu aparelho.
        </p>
      </div>

      <p className="text-sm opacity-60">
        Em construção. Nenhum dado pessoal sai do seu aparelho.
      </p>
    </main>
  );
}

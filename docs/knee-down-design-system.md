# REDESIGN DA PLATAFORMA KNEE DOWN — DESIGN SYSTEM

## Product-owner decisions (supersede parts of this document)

These owner decisions override the corresponding sections above:

- Backgrounds: three levels — TitleBar `--kd-surface-alt`, SidebarLeft `--kd-surface`, main content `--kd-bg`. Mapped as theme tokens (`--color-titlebar-bg`, `--color-sidebar`, `--color-background`) in `@theme inline`; borders/dividers stay `--kd-border`. Cards (`--kd-surface`) keep their current values and remain distinct on the `--kd-bg` main area; no card sits on the new surfaces.
- Typography: Orbitron 800 only in the "knee down" logo, single color `--kd-text` (no red accent on "down"); the NavBar section title leaves Orbitron. All other UI (NavBar, sidebar, screens, inputs, buttons, modals) uses Montserrat via the `--kd-font-ui` token; Barlow Condensed is removed.
- Fonts: Montserrat 400/500/600/800 (latin woff2 from @fontsource/montserrat, OFL) under `src/renderer/src/assets/fonts/montserrat/`; Barlow Condensed woff2 + OFL and Orbitron 900 removed. Tokens: `--kd-font-ui: "Montserrat", sans-serif`; `--kd-font-brand: "Orbitron", sans-serif` (unchanged).

## 1. Objetivo do projeto

Redesenhe a interface da plataforma KNEE DOWN, uma comunidade dedicada a motos esportivas carenadas, motovelocidade, track days, pilotagem esportiva, preparação de motos, eventos e cultura de pista.

A identidade deve transmitir velocidade, precisão, performance, competitividade, tecnologia e pertencimento à comunidade motociclista.

Utilize como referência estética os sites de equipes de competição, campeonatos de motovelocidade e marcas de equipamentos esportivos premium.

O resultado deve ter aparência profissional, forte personalidade visual e excelente usabilidade. Não quero um template genérico de startup, um dashboard corporativo convencional ou uma interface gamer exagerada.

Antes de modificar o código, analise a arquitetura existente, as páginas, os componentes, as funcionalidades e o sistema de estilos. Preserve os comportamentos e as regras de negócio atuais, salvo quando uma alteração for necessária para implementar o redesign.

## 2. Tipografia oficial da marca

### Fonte principal do logotipo

**Orbitron ExtraBold — peso 800.**

Carregue a família Orbitron usando o Google Fonts:

https://fonts.googleapis.com/css2?family=Orbitron:wght@800;900&display=swap

Aplicações:

- Logotipo KNEE DOWN.
- Títulos principais de grande impacto.
- Cabeçalhos de seções importantes.
- Identificadores e elementos gráficos relacionados à competição.

Configuração recomendada:

```css
font-family: 'Orbitron', sans-serif;
font-weight: 800;
text-transform: uppercase;
```

O logotipo deve ter presença visual, aparência geométrica e estética tecnológica. Use espaçamento entre letras levemente negativo quando apropriado, sem comprometer a legibilidade.

Não substitua Orbitron por outra fonte.

### Fonte complementar da interface

Use Barlow Condensed para textos de interface, navegação, descrições, etiquetas e componentes de conteúdo.

Google Fonts:

https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700;800;900&family=Orbitron:wght@800;900&display=swap

Pesos recomendados:

- 400: textos corridos e descrições.
- 500 e 600: textos de interface.
- 700 e 800: navegação, botões e chamadas.
- 900: destaques curtos que exigem impacto.

Barlow Condensed proporciona uma linguagem esportiva e compacta, enquanto Orbitron diferencia a identidade da marca.

Não utilize Orbitron em todos os parágrafos. Preserve a legibilidade e estabeleça uma hierarquia tipográfica consistente.

## 3. Paleta oficial de cores

Utilize os seguintes valores HEX como tokens globais do design system.

### Cores de marca

- Vermelho racing principal: `#FF453A`
- Vermelho para hover: `#FF6259`
- Verde-lima de destaque: `#C5FF42`

O vermelho deve ser a cor de reconhecimento da KNEE DOWN. Utilize-o nos botões primários, palavras destacadas do logotipo, etiquetas de competição, indicadores e elementos de ação.

O verde-lima deve ser secundário e utilizado de maneira seletiva, principalmente em estados ativos, pequenos indicadores, linhas de destaque e interações. Evite que dispute atenção com o vermelho.

### Fundos

- Fundo principal: `#101113`
- Superfície primária de cards: `#191A1D`
- Superfície secundária e blocos de destaque: `#202226`
- Cor de referência para a barra do navegador: `#111214`

A interface deve ser predominantemente escura. Diferencie as seções através de pequenas variações de grafite, bordas, iluminação sutil e espaçamento. Não transforme cada componente em um card com aparência pesada.

## 4. Tokens CSS obrigatórios

Centralize as cores em variáveis globais, adaptando a sintaxe ao framework existente.

```css
:root {
  /* Brand */
  --kd-red: #ff453a;
  --kd-red-hover: #ff6259;
  --kd-lime: #c5ff42;

  /* Backgrounds */
  --kd-bg: #101113;
  --kd-surface: #191a1d;
  --kd-surface-alt: #202226;
  --kd-surface-hover: #2a2d32;
  --kd-browser-theme: #111214;

  /* Text */
  --kd-text: #f2f2ee;
  --kd-text-muted: #a7a9af;
  --kd-text-secondary: #c1c2c6;
  --kd-nav-text: #d1d2d4;
  --kd-text-subtle: #51535a;
  --kd-footer-text: #777a80;

  /* Borders */
  --kd-border: #34363b;
  --kd-border-panel: #3b3d42;
  --kd-border-strong: #45474c;
  --kd-border-button: #62646a;

  /* Typography */
  --kd-font-brand: 'Orbitron', sans-serif;
  --kd-font-ui: 'Montserrat', sans-serif;
}
```

Aplique os tokens de forma consistente em todas as páginas, componentes e estados da interface. Evite criar novas cores arbitrárias quando uma variável existente puder atender à necessidade.

**Hover surface token (`--kd-surface-hover`)**

Purpose: provides a background one step lighter than `--kd-surface-alt` for hover states, ensuring hover is visibly distinct from the underlying surface on all backgrounds (`--kd-bg`, `--kd-surface`, `--kd-surface-alt`).

Justification: no lighter surface token existed above `--kd-surface-alt`; hover states using `--kd-surface-alt` (or `secondary/80`) became indistinguishable from the background on `surface-alt` elements.

Contrast ratios (`#2A2D32` vs. each surface, and `--kd-text` on hover):

| Pair                                       | Ratio   |
| ------------------------------------------ | ------- |
| `--kd-surface-hover` vs `--kd-bg`          | 1.37:1  |
| `--kd-surface-hover` vs `--kd-surface`     | 1.26:1  |
| `--kd-surface-hover` vs `--kd-surface-alt` | 1.15:1  |
| `--kd-text` on `--kd-surface-hover`        | 12.31:1 |

Do not create additional hover tokens; map `accent` and `sidebar-accent` to this token in the shadcn alias map.

## 5. Transparências, overlays e fundos

O layout pode utilizar camadas transparentes para criar profundidade. Preserve os seguintes tratamentos quando forem úteis para o projeto:

- Grade técnica sutil: `rgba(255, 255, 255, 0.022)`.
- Fundo translúcido da navegação: `rgba(16, 17, 19, 0.94)`.
- Halo vermelho ao redor da seção principal: `rgba(255, 69, 58, 0.23)`.
- Halos vermelhos externos: `rgba(255, 69, 58, 0.025)` e `rgba(255, 69, 58, 0.02)`.
- Brilho vermelho em painéis: `rgba(255, 69, 58, 0.11)`.
- Superfície escura translúcida: `rgba(25, 26, 29, 0.93)`.
- Linhas diagonais sutis: `rgba(255, 255, 255, 0.025)`.
- Números decorativos de cards: `rgba(255, 255, 255, 0.035)`.

Use esses efeitos com moderação. A textura de fundo deve ser quase imperceptível e nunca prejudicar a leitura. Os halos vermelhos devem orientar o olhar, não dominar a página.

## 6. Direção de arte e linguagem visual

Adote uma estética inspirada em paddocks, boxes, grids de largada, telemetria, números de competição e sinalização de autódromos.

Características:

- Predominância de preto e grafite.
- Tipografia esportiva e condensada.
- Títulos grandes, objetivos e predominantemente em caixa alta.
- Contraste forte entre títulos e fundos.
- Vermelho como destaque principal.
- Verde-lima como acento secundário.
- Cortes diagonais discretos em botões ou painéis, quando apropriados.
- Linhas técnicas, numeração, pequenas etiquetas e divisores.
- Composição editorial assimétrica, com espaços negativos bem planejados.
- Animações curtas e funcionais, sem excesso de movimento.
- Se fotografias forem utilizadas, priorize motos esportivas carenadas, curvas de pista, boxes, pilotos e equipamentos reais com enquadramento profissional.

Não utilize chamas, caveiras, excesso de efeitos neon, gradientes espalhafatosos ou elementos genéricos que enfraqueçam a identidade.

A estética deve comunicar competição e comunidade, mantendo um acabamento maduro e premium.

## 7. Aplicação por componente

### Cabeçalho e navegação

Use fundo escuro, logotipo Orbitron ExtraBold, links claros e divisória discreta. Reserve o vermelho para a principal chamada de ação. Garanta navegação funcional em dispositivos móveis.

### Hero ou seção principal

Crie uma hierarquia forte com um título de grande escala, descrição curta e chamadas de ação bem diferenciadas. Se existir conteúdo visual, integre-o à composição em vez de adicionar imagens decorativas sem função.

### Botões primários

Utilize fundo `#FF453A`, texto escuro, tipografia de peso elevado e, se combinar com o design existente, pequenos cortes diagonais nos cantos. No hover, utilize `#FF6259`.

### Botões secundários

Use fundo transparente, texto `#F2F2EE` e borda `#62646A`. No hover, a borda e o texto podem assumir `#C5FF42`.

### Cards e painéis

Use `#191A1D` ou `#202226`, com bordas finas e discretas. Aplique pequenos indicadores vermelhos ou verde-lima. Preserve espaçamento interno e legibilidade.

### Títulos de seção

Utilize Orbitron com peso 800. Use vermelho em palavras pontuais ou etiquetas, sem colorir todos os títulos integralmente.

### Textos corridos

Utilize Barlow Condensed. Mantenha altura de linha confortável, largura de leitura adequada e contraste suficiente.

### Rodapé

Use fundo escuro, textos discretos e identidade visual consistente com o cabeçalho. Não deve competir com o conteúdo principal.

## 8. Responsividade e acessibilidade

O redesign deve funcionar em desktop, tablet e celular.

- Preserve ou implemente layouts responsivos.
- Evite que o logotipo ou títulos ultrapassem os limites da tela.
- Garanta que botões e links sejam fáceis de tocar em dispositivos móveis.
- Mantenha foco visível para navegação por teclado.
- Não utilize somente cores para comunicar erros, estados ou ações.
- Verifique o contraste dos textos sobre os fundos.
- Respeite a preferência por movimento reduzido.
- Não sacrifique a legibilidade para forçar uma estética de competição.

## 9. Regras de implementação

1. Inspecione a estrutura atual antes de iniciar as mudanças.
2. Reutilize componentes, rotas e funcionalidades existentes sempre que possível.
3. Centralize a identidade visual em tokens e estilos compartilhados.
4. Evite duplicar regras CSS ou introduza dependências desnecessárias.
5. Não altere dados, autenticação, integrações ou lógica de negócio como consequência acidental do redesign.
6. Não substitua a Orbitron ExtraBold no logotipo.
7. Não transforme todas as cores em vermelho: preserve a hierarquia definida nesta especificação.
8. Não utilize Barlow Condensed como substituta da fonte do logotipo.
9. Não preencha a interface com conteúdo fictício se houver dados reais disponíveis.
10. Verifique os estados de hover, foco, ativo, carregamento e erro dos componentes modificados.

## 10. Resultado esperado

Entregue um redesign coerente da KNEE DOWN, com identidade visual própria, tipografia consistente, paleta aplicada globalmente e acabamento profissional de plataforma de motovelocidade.

O resultado precisa parecer uma marca real ligada a motos esportivas carenadas e cultura de pista, e não apenas um site escuro com detalhes vermelhos.

Ao concluir, apresente um resumo dos arquivos alterados, das decisões de design implementadas e das verificações realizadas. Informe com transparência qualquer funcionalidade que não tenha sido possível preservar ou validar.

A prioridade é construir uma identidade reconhecível, consistente, responsiva e preparada para crescer junto com a comunidade.

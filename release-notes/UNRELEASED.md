# Unreleased

- Roll Requests keeps the check builder on one row. Specialty requests, including Delerium Search and a labeled Roll of Fate card, use a responsive card grid. Roll of Fate can choose the party or the selected tokens. GM Settings can hide each specialty for the current world.
- Macro pins show the icon on the left and the name on the right. Long names truncate with an ellipsis, and the full name is on hover. Dragging a pin reorders it and saves that order immediately without running the macro.
- Trigger cards use one header row for the name, scope, status icon, and play/pause control. When and Then sit tightly underneath, and each card is only as tall as that content. The Triggers tab no longer has a New Trigger button. Trigger behavior stays in module code.
- Campaign AI asks a Campaign AI relay instead of OpenAI. GM Settings stores the relay URL, token, and campaign for the world. The thread polls only while that tab is open, and answers render as safe markdown.

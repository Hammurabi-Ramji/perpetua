<script lang="ts">
	export let label: string;
	export let value: number | string;
	export let tone: 'default' | 'success' | 'warning' | 'danger' = 'default';
</script>

<article class={`stat-card tone-${tone}`}>
	<p>{label}</p>
	<strong>{value}</strong>
</article>

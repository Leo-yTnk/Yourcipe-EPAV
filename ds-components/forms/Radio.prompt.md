Single radio button; group several with the same `name` for exclusive selection.

```jsx
<Radio name="unit" label="Metric" checked={unit==='metric'} onChange={() => setUnit('metric')} />
```

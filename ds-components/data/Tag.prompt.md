Filter chip; toggle `selected` for filter bars, or pass `onRemove` for removable ingredient/tag lists.

```jsx
<Tag selected onClick={toggle}>Under 30 min</Tag>
<Tag onRemove={() => removeIngredient('garlic')}>Garlic</Tag>
```

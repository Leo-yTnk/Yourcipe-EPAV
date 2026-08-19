Centered modal with scrim overlay; clicking the scrim or ✕ closes it.

```jsx
<Dialog open={open} title="Delete recipe?" onClose={close} actions={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="danger" onClick={confirm}>Delete</Button></>}>
  This can't be undone.
</Dialog>
```

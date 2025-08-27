import React from "react";
export class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state={hasError:false, err:null}; }
  static getDerivedStateFromError(err){ return {hasError:true, err}; }
  componentDidCatch(err, info){ console.error("SafeSwap Error:", err, info); }
  render(){ return this.state.hasError ? <div className="error">Something went wrong. Try refresh.</div> : this.props.children; }
}
export default ErrorBoundary;

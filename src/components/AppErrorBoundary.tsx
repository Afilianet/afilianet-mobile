import { Component, type ReactNode } from "react";
import { captureException } from "../services/sentry";
import { ErrorState } from "./ErrorState";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    captureException(error);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorState error={null} onRetry={() => this.setState({ hasError: false })} />;
    }
    return this.props.children;
  }
}

# Build
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /espejo ./cmd/server

# Run
FROM alpine:3.19
RUN apk --no-cache add ca-certificates wget
WORKDIR /app
COPY --from=builder /espejo .
EXPOSE 8080
ENV PORT=8080
CMD ["./espejo"]

/**
 * This script signs a payload with a secret, and sends the
 * payload along with the signature to our API.
 *
 * This will be used to verify if we can successfully verify the signature in
 * our lambda function using the raw json string instead of the raw byte buffer.
 *
 * This is a modified example from the Zai documentation:
 * https://developer.hellozai.com/docs/verify-webhook-signatures#example-implementations
 *
 * The payload is taken from the BigCommerce docs.
 * This provides a good example as the key / value pairs are not in alphabetical order,
 * which would result in a different signature if we were to generate one from
 * the payload as a plain javascript object.
 *
 * https://developer.bigcommerce.com/docs/integrations/webhooks#creating-a-webhook
 */

package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/oklog/ulid/v2"
)

const (
	hostURL  = "https://4sm9afiph5.execute-api.us-east-1.amazonaws.com"
	endpoint = "/webhooks/bigcommerce"
	apiURL   = hostURL + endpoint
	secret   = "xPpcHHoAOM"
)

var (
	programLevel = new(slog.LevelVar)
	handler      = slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: programLevel})
	logger       = slog.New(handler)
)

type payload struct {
	Scope     string `json:"scope"`
	StoreID   string `json:"store_id"`
	Data      data   `json:"data"`
	Hash      string `json:"hash"`
	CreatedAt int64  `json:"created_at"`
	Producer  string `json:"producer"`
}

type data struct {
	Type string `json:"type"`
	ID   int    `json:"id"`
}

func createSignatureToken(payload []byte, secretKey string) (string, error) {
	hash := hmac.New(sha256.New, []byte(secretKey))
	signedPayload := string(payload)
	_, err := io.WriteString(hash, signedPayload)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(hash.Sum(nil)), nil
}

func createAndSendWebhook() (string, error) {
	programLevel.Set(slog.LevelDebug)

	payload := payload{
		Scope:     "store/order/created",
		StoreID:   "1025646",
		Data:      data{Type: "order", ID: 250},
		Hash:      ulid.Make().String(),
		CreatedAt: 1561479335,
		Producer:  "stores/{store_hash}",
	}

	buffer, err := json.Marshal(payload)
	if err != nil {
		logger.Error("Failed to marshall payload", "error", err)
		message := fmt.Sprintf("Error marshalling payload: %v", err)
		return message, err
	}

	logger.Debug("Webhook Payload", "payload", payload)

	signature, _ := createSignatureToken(buffer, secret)
	logger.Debug("Webhook Signature", "signature", signature)

	req, err := http.NewRequest("POST", apiURL, bytes.NewReader(buffer))
	if err != nil {
		logger.Error("Error creating request", "error", err)
		message := fmt.Sprintf("Error creating request: %v", err)
		return message, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Signature", signature)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		logger.Error("Error sending request to API", "endpoint", endpoint, "error", err)
		message := fmt.Sprintf("Error sending request: %v", err)
		return message, err
	}

	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		logger.Error("API request failed", "status", resp.StatusCode)
		message := fmt.Sprintf("API request failed with status: %v", resp.StatusCode)
		return message, err
	}

	logger.Info("Sent Webhook to API", "URL", apiURL, "status", resp.StatusCode)

	return fmt.Sprintf("Webhook sent to %s", apiURL), nil
}

func Handler(request events.APIGatewayV2HTTPRequest) (events.APIGatewayProxyResponse, error) {
	message, err := createAndSendWebhook()

	if err != nil {
		return events.APIGatewayProxyResponse{
			Body:       message,
			StatusCode: 500,
		}, nil
	}

	return events.APIGatewayProxyResponse{
		Body:       message,
		StatusCode: 200,
	}, nil
}

func main() {
	lambda.Start(Handler)
}

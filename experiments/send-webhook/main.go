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

	"github.com/oklog/ulid/v2"
)

const (
	apiURL = "https://4sm9afiph5.execute-api.us-east-1.amazonaws.com/webhooks/bigcommerce"
	secret = "xPpcHHoAOM"
)

var (
	programLevel = new(slog.LevelVar)
	handler      = slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: programLevel})
	logger       = slog.New(handler)
)

type Payload struct {
	Scope     string `json:"scope"`
	StoreID   string `json:"store_id"`
	Data      Data   `json:"data"`
	Hash      string `json:"hash"`
	CreatedAt int64  `json:"created_at"`
	Producer  string `json:"producer"`
}

type Data struct {
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

func main() {
	programLevel.Set(slog.LevelDebug)

	payload := Payload{
		Scope:     "store/order/created",
		StoreID:   "1025646",
		Data:      Data{Type: "order", ID: 250},
		Hash:      ulid.Make().String(),
		CreatedAt: 1561479335,
		Producer:  "stores/{store_hash}",
	}

	buffer, error := json.Marshal(payload)
	if error != nil {
		fmt.Println("Error marshalling payload:", error)
		return
	}

	logger.Debug("Webhook Payload", "payload", payload)

	signature, _ := createSignatureToken(buffer, secret)
	logger.Debug("Webhook Signature", "signature", signature)

	req, err := http.NewRequest("POST", apiURL, bytes.NewReader(buffer))
	if err != nil {
		fmt.Println("Error creating request:", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Signature", signature)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Println("Error sending request:", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fmt.Println("API request failed with status:", resp.StatusCode)
		return
	}

	logger.Info("Sent Webhook to API", "URL", apiURL, "status", resp.StatusCode)

}
